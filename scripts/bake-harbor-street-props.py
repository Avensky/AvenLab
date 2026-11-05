"""Extract one reusable mesh per street prop, with small texture atlases, from the downloaded Downtown kit."""
import json,struct,subprocess
from pathlib import Path
from io import BytesIO
import numpy as np
from PIL import Image
import DracoPy
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'frontend/public/models/world/props/DowntownObj_Props.glb'
raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:]
out={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'textures':[],'images':[],'buffers':[]}
data=bytearray();catalog=[]
def block(value):
    data.extend(b'\0'*(-len(data)%4));offset=len(data);data.extend(value);out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(value)});return len(out['bufferViews'])-1
def srcview(i):
    view=g['bufferViews'][i];off=view.get('byteOffset',0);return binary[off:off+view['byteLength']]
def acc(a,kind,t,bounds=False):
    info=dict(bufferView=block(a.tobytes()),componentType=t,count=len(a),type=kind)
    if bounds:info.update(min=a.min(0).tolist(),max=a.max(0).tolist())
    out['accessors'].append(info);return len(out['accessors'])-1
for family,name,height,tint in [('HotDogStand','FoodCart',2.45,'cart'),('StreetBin','Bin',1.05,'metal'),
 ('SM_RestaurantTable','CafeTable',.78,''),('SM_Chair','CafeChair',.92,''),('NewspaperBox','NewsBox',1.02,''),
 ('TrashBags','AlleyBags',.6,''),('LaneClosed','LaneSign',1.35,''),('RoadClosed','RoadSign',1.28,''),
 ('TrafficPoles_013','StreetLamp',6.4,'metal')]:
    node=next(node for node in g['nodes'] if node['name'].startswith(family) and 'mesh' in node)
    p=g['meshes'][node['mesh']]['primitives'][0];d=p['extensions']['KHR_draco_mesh_compression'];mesh=DracoPy.decode(srcview(d['bufferView']))
    xyz=mesh.points@np.diag(node.get('scale',[1]*3))@Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix().T
    lo=xyz.min(0);hi=xyz.max(0);size=hi-lo;xyz=(xyz-(lo+[size[0]/2,0,size[2]/2]))/size
    faces=mesh.faces.copy();uv=mesh.get_attribute_by_unique_id(d['attributes']['TEXCOORD_0'])['data']
    mat=g['materials'][p['material']];orig=mat.get('pbrMetallicRoughness',{});pbr={'metallicFactor':.08,'roughnessFactor':.72}
    colors=np.ones((len(xyz),3),dtype='<f4')
    if 'baseColorTexture' in orig:
        tex=g['textures'][orig['baseColorTexture']['index']];img=g['images'][tex.get('extensions',{}).get('EXT_texture_webp',tex)['source']]
        im=Image.open(BytesIO(srcview(img['bufferView']))).convert('RGB');im.thumbnail((512,512));b=BytesIO();im.save(b,format='JPEG',quality=88)
        out['images'].append(dict(bufferView=block(b.getvalue()),mimeType='image/jpeg'));out['textures'].append(dict(source=len(out['images'])-1));pbr['baseColorTexture']={'index':len(out['textures'])-1}
    else:
        colors[:]=[.27,.31,.30] if tint=='metal' else [.51,.49,.42]
        if tint=='cart':
            canopy=xyz[:,1]>.72;stripes=(np.floor((xyz[:,0]+.5)*9).astype(int)%2)==0
            colors[canopy]=[.75,.62,.33];colors[canopy & stripes]=[.64,.10,.055];colors[xyz[:,1]<.18]=[.06,.07,.075]
    if name=='StreetLamp':
        # Locate the end of the actual pole arm. The small emissive fixture uses this measured socket.
        top=xyz[xyz[:,1]>.8];base=xyz[xyz[:,1]<.10][:,[0,2]].mean(0);tip=top[np.linalg.norm((top[:,[0,2]]-base)*size[[0,2]],axis=1).argmax()]
        tip=tip.round(4).tolist()
    norm=np.zeros_like(xyz);tri=xyz[faces];cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
    for k in range(3):np.add.at(norm,faces[:,k],cross)
    norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-12)
    idx=len(out['nodes']);out['scenes'][0]['nodes'].append(idx);out['nodes'].append(dict(name=name,mesh=idx))
    out['materials'].append(dict(name=name,pbrMetallicRoughness=pbr,doubleSided=True))
    out['meshes'].append({'primitives':[dict(material=idx,attributes={'POSITION':acc(xyz.astype('<f4'),'VEC3',5126,True),'NORMAL':acc(norm.astype('<f4'),'VEC3',5126),'TEXCOORD_0':acc(uv.astype('<f4'),'VEC2',5126),'COLOR_0':acc(colors,'VEC3',5126)},indices=acc(faces.astype('<u4').ravel(),'SCALAR',5125))]})
    catalog.append(dict(node=name,size=(size*height/size[1]).round(3).tolist(),**({'tip':tip} if name=='StreetLamp' else {})))
data.extend(b'\0'*(-len(data)%4));out['buffers']=[dict(byteLength=len(data))];j=json.dumps(out,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
(ROOT/'frontend/public/models/world/harbor-street-props.glb').write_bytes(struct.pack('<4sIIII',b'glTF',2,len(data)+len(j)+28,len(j),0x4E4F534A)+j+struct.pack('<I4s',len(data),b'BIN\0')+data)
(ROOT/'frontend/src/worldBuilder/props/harborStreetProps.json').write_text(json.dumps(catalog,indent=2)+'\n')

subprocess.run(['node',str(ROOT/'frontend/scripts/optimize-harbor-street-props.mjs')],check=True)
