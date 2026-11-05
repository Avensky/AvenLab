"""Bake graphics-only medium and far vehicle shells. Requires numpy, scipy, Pillow, DracoPy and a meshoptimizer shared library."""
import argparse
import ctypes
import ctypes.util
from collections import defaultdict
from io import BytesIO
import json
from pathlib import Path
import re
import struct

import DracoPy
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation

MODELS = "ae86 brz camaro supra mini sierra landcruiser fortuner cx30 tank enforcer interceptor charger70 skyline34 timecar patrolclassic".split()
KINDS = {0:"POSITION", 1:"NORMAL", 2:"COLOR_0", 3:"TEXCOORD_0"}
DTYPES = {5120:"i1",5121:"u1",5122:"<i2",5123:"<u2",5125:"<u4",5126:"<f4"}
COMPONENTS = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}
PAINT = re.compile(r"^(body|primary(?:\.\d+)?|ext(?:\.\d+)?)$|PaintTNR_Material1$",re.I)
def read_source(path):
    raw=path.read_bytes()
    if raw[:4]!=b"glTF": raise ValueError(f"Materialize the Git LFS file {path}")
    length=struct.unpack_from("<I",raw,12)[0]
    return json.loads(raw[20:20+length]), memoryview(raw)[28+length:]

def walk(doc):
    def visit(i,parent):
        n=doc["nodes"][i]
        if "matrix" in n: local=np.array(n["matrix"]).reshape(4,4).T
        else:
            local=np.eye(4);local[:3,:3]=Rotation.from_quat(n.get("rotation",[0,0,0,1])).as_matrix()@np.diag(n.get("scale",[1]*3))
            local[:3,3]=n.get("translation",[0]*3)
        world=parent@local
        if "mesh" in n: yield n.get("name",""),doc["meshes"][n["mesh"]],world
        for j in n.get("children",[]): yield from visit(j,world)
    for i in doc["scenes"][doc.get("scene",0)]["nodes"]: yield from visit(i,np.eye(4))

def source_parts(model,path):
    doc,bin=read_source(path);textures={};parts=defaultdict(list);source_triangles=0
    def view(i):
        v=doc["bufferViews"][i];off=v.get("byteOffset",0)
        return bin[off:off+v["byteLength"]]
    def accessor(i):
        a=doc["accessors"][i];v=doc["bufferViews"][a["bufferView"]];t=np.dtype(DTYPES[a["componentType"]]);k=COMPONENTS[a["type"]]
        data=np.ndarray((a["count"],k),t,view(a["bufferView"]),a.get("byteOffset",0),(v.get("byteStride",t.itemsize*k),t.itemsize))
        return data.astype(float)/np.iinfo(t).max if a.get("normalized") else data
    def texture(index):
        if index not in textures:
            t=doc["textures"][index];src=t.get("extensions",{}).get("EXT_texture_webp",t)["source"]
            image=Image.open(BytesIO(view(doc["images"][src]["bufferView"]))).convert("RGB")
            image.thumbnail((256,256)); rgb=np.asarray(image)/255.
            textures[index]=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
        return textures[index]
    for name,mesh,world in walk(doc):
        if model=="tank" and (name in ("Empty","Tank_Body_Non_Modular","Hatch_Front_Hatch_Hull","Breech") or "Interior" in name):continue
        if re.search(r"interior|collision|collider",name,re.I):continue
        for p in mesh["primitives"]:
            if p.get("mode",4)!=4:continue
            dc=p.get("extensions",{}).get("KHR_draco_mesh_compression")
            if dc:
                m=DracoPy.decode(bytes(view(dc["bufferView"])))
                attrs={k:m.get_attribute_by_unique_id(v)["data"] for k,v in dc["attributes"].items()}
                faces=m.faces
            else:
                attrs={k:accessor(v) for k,v in p["attributes"].items() if k in ("POSITION","NORMAL","TEXCOORD_0")}
                faces=accessor(p["indices"]).ravel().reshape(-1,3) if "indices" in p else np.arange(len(attrs["POSITION"])).reshape(-1,3)
            pos=attrs["POSITION"]@world[:3,:3].T+world[:3,3]
            if np.linalg.det(world[:3,:3])<0:faces=faces[:,[0,2,1]]
            mat=doc["materials"][p.get("material",0)];surface=mat.get("pbrMetallicRoughness",{});label=mat.get("name","")
            if re.search(r"^interior|^seat(?:belt|material|leather)|^carpet",label,re.I):continue
            paint=bool(PAINT.search(label)) and model!="tank"
            color=np.tile(surface.get("baseColorFactor",[1,1,1,1])[:3],(len(pos),1)).astype(float)
            if "baseColorTexture" in surface and "TEXCOORD_0" in attrs:
                tex=texture(surface["baseColorTexture"]["index"]);uv=attrs["TEXCOORD_0"]%1
                color*=tex[(uv[:,1]*len(tex)).astype(int)%len(tex),(uv[:,0]*tex.shape[1]).astype(int)%tex.shape[1]]
            glass=bool(re.search(r"glass|windshield|window",label,re.I)) or (model=="brz" and label=="material_16")
            if glass:
                # Tinted exterior glazing is opaque in the batched pass. Preserve the light lenses.
                if re.search(r"red|tail|brake",label,re.I):color[:]=[.45,.015,.018]
                elif re.search(r"clear|lamp|headlight",label,re.I):color[:]=[.42,.48,.52]
                else:color[:]=[.042,.066,.080]
            if re.search(r"tire|tyre|rubber",label,re.I):color[:]=[.027,.030,.032]
            group=("cannon" if name=="Cannon" else "turret" if name in ("Turret","TurretBasket","Hatch_Small","Hatch_Small2","Hatch_Hull") else "trim") if model=="tank" else "paint" if paint else "glass" if glass else "trim"
            # Inverse transpose in column-vector notation. Retain authored split normals.
            if "NORMAL" in attrs:
                normals=attrs["NORMAL"]@np.linalg.pinv(world[:3,:3])
            else:
                normals=np.zeros_like(pos)
                face_normals=np.cross(pos[faces[:,1]]-pos[faces[:,0]],pos[faces[:,2]]-pos[faces[:,0]])
                for corner in range(3):np.add.at(normals,faces[:,corner],face_normals)
            normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
            parts[group].append((pos,faces,color,normals));source_triangles+=len(faces)
    return parts, source_triangles

def mesh_simplifier(library):
    lib=ctypes.CDLL(library or ctypes.util.find_library("meshoptimizer") or "libmeshopt.so")
    fn=lib.meshopt_simplifyWithAttributes
    ptr=ctypes.c_void_p
    size=ctypes.c_size_t
    fn.argtypes=[ptr,ptr,size,ptr,size,size,ptr,size,ptr,size,ptr,size,ctypes.c_float,ctypes.c_uint,ptr]
    fn.restype=size
    return fn

def reduce(parts,ratio,error,simplify):
    merged=[[],[],[],[]]
    offset=0
    weights=np.array([.3,.3,.3,.12,.12,.12],dtype="f4")
    for pos,faces,rgb,normals in parts:
        # Weld only identical render vertices in this material and primitive.
        # Edge collapse retains real source vertices and their original normal/color.
        records=np.ascontiguousarray(np.column_stack([pos,normals,rgb]),dtype="f4")
        if ratio>.2:
            _,representatives,ids=np.unique(records.view(np.dtype((np.void,36))).ravel(),return_index=True,return_inverse=True)
            records=records[representatives]
            pos=np.ascontiguousarray(records[:,:3])
            attrs=np.ascontiguousarray(records[:,3:])
        else:
            # Texture and split-normal seams can lock almost every edge of a
            # wheel. At smaller sizes reunite coincident vertices per primitive.
            keys=np.ascontiguousarray(np.round(pos,5),dtype="f4")
            _,keep,ids=np.unique(keys.view(np.dtype((np.void,12))).ravel(),return_index=True,return_inverse=True)
            ids=ids.ravel()
            pos=np.ascontiguousarray(records[keep,:3])
            count=np.bincount(ids)
            attrs=np.column_stack([np.bincount(ids,weights=a)/count for a in records[:,3:].T]).astype("f4")
            attrs[:,:3]/=np.maximum(np.linalg.norm(attrs[:,:3],axis=1)[:,None],1e-8)
        idx=np.ascontiguousarray(ids[faces].ravel(),dtype="u4")
        target=max(12,min(len(idx),int(len(idx)*ratio)//3*3))
        if target<len(idx):
            out=np.empty_like(idx)
            used=simplify(out.ctypes.data,idx.ctypes.data,len(idx),pos.ctypes.data,len(pos),12,
                          attrs.ctypes.data,24,weights.ctypes.data,6,None,target,error,8 if ratio<.2 else 0,None)
            if used:idx=out[:used]
        keep,remap=np.unique(idx,return_inverse=True)
        for bucket,values in zip(merged,[pos[keep],remap.reshape(-1,3)+offset,attrs[keep,3:],attrs[keep,:3]]):
            bucket.append(values)
        offset+=len(keep)
    return [np.concatenate(chunks) for chunks in merged]

def write(path,parts,model,ratio,error,simplify):
    doc={"asset":{"version":"2.0","generator":"AvenLab vehicle LOD bake"},"scene":0,"scenes":[{"nodes":[]}],"nodes":[],"meshes":[],"materials":[],"buffers":[],"bufferViews":[],"accessors":[],"extensionsRequired":["KHR_draco_mesh_compression"],"extensionsUsed":["KHR_draco_mesh_compression"]}
    binary=bytearray();triangles=0
    foot=min(p[:,1].min() for group in parts.values() for p,_,_,_ in group)
    def acc(kind,t,n,**kwargs):
        doc["accessors"].append(dict(type=kind,componentType=t,count=n,**kwargs));return len(doc["accessors"])-1
    for name,group in parts.items():
        v,f,c,normals=reduce(group,ratio,error,simplify)
        if not len(f):continue
        v[:,1]-=foot
        pivot=[0,0,0]
        if name=="turret":pivot=[0,1.30-foot,.10]
        if name=="cannon":pivot=[0,1.65-foot,1.05]
        v-=pivot
        factory=np.clip(np.median(c,axis=0),.006,1).tolist() if name=="paint" else [1,1,1]
        colors=np.asarray(np.clip(c,0,1)*255+.5,dtype="u1") if name!="paint" else None
        b=DracoPy.encode(v.astype(float),f.astype("u4"),normals=normals.astype(float),colors=colors,quantization_bits=14,normal_quantization_bits=11,compression_level=5)
        mesh=DracoPy.decode(b);size=len(mesh.points);faces=mesh.faces.size
        binary+=b'\0'*(-len(binary)%4);vid=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(b)));binary+=b
        attrs={"POSITION":acc("VEC3",5126,size,min=mesh.points.min(0).tolist(),max=mesh.points.max(0).tolist()),"NORMAL":acc("VEC3",5126,size)}
        if colors is not None:attrs["COLOR_0"]=acc("VEC3",5121,size,normalized=True)
        keys={KINDS[a['attribute_type']]:a['unique_id'] for a in mesh.attributes};i=len(doc['nodes'])
        doc['materials'].append(dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=factory+[1],metallicFactor=.22,roughnessFactor=.22 if name=="glass" else .36 if name=="paint" else .60)))
        doc['meshes'].append(dict(primitives=[dict(material=i,attributes=attrs,indices=acc("SCALAR",5123 if size<=65535 else 5125,faces),extensions={"KHR_draco_mesh_compression":dict(bufferView=vid,attributes=keys)})]))
        doc['nodes'].append(dict(name=name,mesh=i,translation=pivot));doc['scenes'][0]['nodes'].append(i);triangles+=faces//3
    binary+=b'\0'*(-len(binary)%4);doc['buffers']=[dict(byteLength=len(binary))];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
    return triangles,len(doc['meshes']),len(binary)

def bake_seed(parts,model,library):
    """An immediately available exterior for cold joins. No loader, worker or network wait."""
    import base64
    import struct
    lib=ctypes.CDLL(library or ctypes.util.find_library("meshoptimizer") or "libmeshopt.so")
    fn=lib.meshopt_simplifySloppy
    ptr=ctypes.c_void_p;size=ctypes.c_size_t
    fn.argtypes=[ptr,ptr,size,ptr,size,size,size,ctypes.c_float,ptr];fn.restype=size
    foot=min(p[:,1].min() for group in parts.values() for p,_,_,_ in group)
    output=[]
    for name,group in parts.items():
        verts=[];tri=[];offset=0
        for p,f,c,n in group:
            span=np.ptp(p,axis=0)
            if np.linalg.norm(span)<.20:continue
            flat=np.ascontiguousarray(f.ravel(),dtype='u4')
            positions=np.ascontiguousarray(p,dtype='f4')
            out=np.empty_like(flat)
            target=max(12,int(len(f)*.009)*3)
            used=fn(out.ctypes.data,flat.ctypes.data,len(flat),positions.ctypes.data,len(p),12,target,.35,None) if len(flat)>target else 0
            if used:idx=out[:used]
            elif len(f)<=28:idx=flat
            else:continue
            keep,idx=np.unique(idx,return_inverse=True)
            verts.append(np.column_stack([p[keep],n[keep],c[keep]]));tri.append(idx+offset);offset+=len(keep)
        if not verts:continue
        vertices=np.concatenate(verts);faces=np.concatenate(tri)
        xyz=vertices[:,:3].copy();xyz[:,1]-=foot
        pivot=[0,1.30-foot,.10] if name=='turret' else [0,1.65-foot,1.05] if name=='cannon' else [0,0,0]
        xyz-=pivot
        # Millimetres, signed normals, linear RGB and little-endian indices.
        assert np.max(np.abs(xyz))<32.7 and len(xyz)<65536
        packed=(np.round(xyz*1000).astype('<i2').tobytes()+
                np.round(np.clip(vertices[:,3:6],-1,1)*127).astype('i1').tobytes()+
                np.round(np.clip(vertices[:,6:],0,1)*255).astype('u1').tobytes()+
                faces.astype('<u2').tobytes())
        color=np.clip(np.median(vertices[:,6:],axis=0),.006,1).tolist() if name=='paint' else [1,1,1]
        output.append(dict(name=name,pivot=pivot,vertices=len(xyz),color=color,data=base64.b64encode(packed).decode()))
    return output

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--meshoptimizer',help='Path to a meshoptimizer shared library')
    parser.add_argument('--models',nargs='+',choices=MODELS,default=MODELS)
    parser.add_argument('--seeds',type=Path,help='Write the bundled cold-join geometry as JSON')
    args=parser.parse_args()
    seeds={}
    args.output.mkdir(parents=True,exist_ok=True)
    simplify=mesh_simplifier(args.meshoptimizer)
    for model in args.models:
        parts,original=source_parts(model,args.source/(('supra_2020' if model=='supra' else model)+'.glb'))
        if args.seeds:seeds[model]=bake_seed(parts,model,args.meshoptimizer)
        for tier,ratio,error in [('near',.39,.006),('medium',.11,.025),('far',.025,.075)]:
            result=write(args.output/f'{model}-{tier}.glb',parts,model,ratio,error,simplify)
            print(model,tier,original,*result,flush=True)
    if args.seeds:args.seeds.write_text(json.dumps(seeds,separators=(',',':'))+'\n')
