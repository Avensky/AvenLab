"""Extract the drawable road lamps from the shipping GLBs. Run from the repository root.
Requires the same Python dependencies as bake-vehicle-lods.py. No original model is modified.
"""
import argparse
import ctypes
import ctypes.util
import base64
from collections import defaultdict
from io import BytesIO
from PIL import Image
import importlib.util
import json
from pathlib import Path
import re

import DracoPy
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("lod",HERE/"bake-vehicle-lods.py")
lod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lod)
ASSETS=HERE.parent/"frontend/public/models/vehicles"
OUTPUT=HERE.parent/"frontend/src/vehicles/tools/roadLensGeometry.json"
# Values are the shader's categories. The road coordinate system is +Z forward, +X driver left.
HEAD,POPUP,FOG,TAIL,STOP,LEFT,RIGHT,RED_LEFT,RED_RIGHT,PLATE=range(1,11)

def vertices(doc, binary, primitive, world):
    def view(i):
        buf=doc["bufferViews"][i]
        off=buf.get("byteOffset",0)
        return binary[off:off+buf["byteLength"]]
    def accessor(i):
        a=doc["accessors"][i]; buf=doc["bufferViews"][a["bufferView"]]
        dt=np.dtype(lod.DTYPES[a["componentType"]]); parts=lod.COMPONENTS[a["type"]]
        return np.ndarray((a["count"],parts),dt,view(a["bufferView"]),a.get("byteOffset",0),
                          strides=(buf.get("byteStride",dt.itemsize*parts),dt.itemsize))
    ext=primitive.get("extensions",{}).get("KHR_draco_mesh_compression")
    if ext:
        mesh=DracoPy.decode(bytes(view(ext["bufferView"])))
        xyz,idx=mesh.points,mesh.faces
    else:
        xyz=accessor(primitive["attributes"]["POSITION"])
        idx=accessor(primitive["indices"]).reshape(-1,3) if "indices" in primitive else np.arange(len(xyz)).reshape(-1,3)
    # Draco reorders the vertices. Read UVs from the same decoded stream.
    if ext and "TEXCOORD_0" in ext["attributes"]:
        uv=mesh.get_attribute_by_unique_id(ext["attributes"]["TEXCOORD_0"])["data"]
    else:
        uv=accessor(primitive["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in primitive["attributes"] and not ext else None
    return xyz@world[:3,:3].T+world[:3,3],idx,uv

def components(points,faces):
    unique,inv=np.unique(points.round(4),axis=0,return_inverse=True)
    ids=inv.ravel()[faces]; edges=np.vstack([ids[:,[0,1]],ids[:,[1,2]]]).T
    _,labels=connected_components(coo_matrix((np.ones(edges.shape[1]),edges),
                                 shape=(len(unique),len(unique))),directed=False)
    face_ids=labels[ids[:,0]]
    for key in np.unique(face_ids):
        yield points[faces[face_ids==key]]

def wanted(model,node,material):
    if model=="ae86": return node in ("HeadlightLenses","LightLenses") or material.startswith("LicensePlate")
    if model=="brz": return "LENS_COVER" in node or node in ("TRUNK_05","TRUNK_LISENCE_PLATE","Mesh101__Color_B03_1_0","Mesh85__Color_B03_1_0")
    if model=="camaro": return node in ("CENTER_BREAK_LIGHT","HEADLIGHT_LENS_LEFT","HEADLIGHT_LENS_RIGHT","TAILLIGHT_LENS_LEFT","TAILLIGHT_LENS_RIGHT","HEADLIGHTS","REARBUMPER_lights") or "plate" in material.lower()
    if model=="supra": return "red_glass" in material or ("_Window_Geo" in node and "Window_Material" in material) or "LightG_Material" in material or "ManufacturerPlate" in material
    if model=="fortuner" and material=="fortuner_in_decals":return True
    if (model=="interceptor" and material=="Iner:B8_F9_B1_38") or (model=="timecar" and "1985Textured2A_" in material):return True
    return (node.startswith(("BODY","LAMP","GLASS","TRIM")) and bool(re.search(r"glass|lens|light|lamp|emis|plate|red_glas|ext_red",material,re.I)))

def sections(model,node,material,tri):
    """Classify separate lamp islands, then split dual-function lenses on that lens's own width."""
    pts=tri.reshape(-1,3);lo,hi=pts.min(0),pts.max(0);x,y,z=(lo+hi)/2;dx,dy,dz=hi-lo
    m=material.lower(); n=node.lower(); side=LEFT if x>0 else RIGHT; red=RED_LEFT if x>0 else RED_RIGHT
    if 'plate' in n+m or 'lisence' in n or (model=='fortuner' and m=='fortuner_in_decals') or (model=='interceptor' and m=='iner:b8_f9_b1_38') or (model=='timecar' and '1985textured2a_' in m):
        if z < -1.45 and abs(x)<.15 and .10<dx<.65 and .045<dy<.30:
            # A narrow lit lip above the actual rear plate, including its native depth and slope.
            part=plate_lip(lo,hi)
            yield PLATE,part
        return
    def split(base,turn,fraction,center=None,omit_inner=0):
        mid=x if center is None else center
        sign=1 if mid>0 else -1
        at=sign*tri.mean(1)[:,0]
        a,b=sorted((sign*lo[0],sign*hi[0]))
        outer=at>a+(b-a)*fraction
        yield base,tri[(~outer)&(at>=a+omit_inner*(b-a))]
        yield turn,tri[outer]
    if model=="ae86":
        if node=="HeadlightLenses":yield POPUP,tri
        elif z<0: yield from split(TAIL,side,.80,omit_inner=.13)
        else:yield side,tri
    elif model=="brz":
        if node=='TRUNK_05':yield STOP,tri
        elif node.startswith(('Mesh101','Mesh85')):yield TAIL,tri
        elif 'taillight' in n:
            # The red internal arc supplies the running/brake lamp. The outer lens chamber is the indicator.
            for role,part in split(TAIL,side,.77):
                if role==side:yield role,part
        elif z>1:yield from split(HEAD,side,.84)
    elif model=="camaro":
        if node=='CENTER_BREAK_LIGHT':yield STOP,tri
        elif 'taillight_lens' in n:yield from split(TAIL,red,.72)
        elif 'headlight_lens' in n:yield from split(HEAD,side,.86)
        elif node=='HEADLIGHTS' and 1.5<z and .42<y<.59:yield FOG,tri
    elif model=="supra":
        if 'red_glass' in m and y>.55 and z< -1.5:yield from split(TAIL,side,.80)
        elif '_window_geo' in n and .3<abs(x)<.85 and 1.5<z and dx>.16 and y<.85:yield from split(HEAD,side,.85)
        elif 'lightg_material' in m and abs(x)<.05 and y>1.0 and z< -1.0 and dx>.20:yield STOP,tri
        elif 'lightg_material' in m and abs(x)<.16 and z< -1.8 and dy<.01:yield PLATE,tri
    elif model=='skyline34':
        if 'red_glass' in m and z< -1.5:yield TAIL,tri
        elif 'ambar' in m and z< -1.5:yield side,tri
        elif 'ambar' in m and z>1.7:yield FOG,tri
        elif 'lighta_material1.001' in m and z>1.7:yield (side if abs(x)>.69 else HEAD),tri
        elif 'lighta_material1' in m and abs(x)<.05 and y>.25 and z< -2:yield STOP,tri
    elif model=='charger70':
        if m=='glassmtl' and z>2.25 and dx<.22 and y>-.2:yield HEAD,tri
        elif m=='glassred' and z< -2:yield from split(TAIL,red,.79)
        elif m=='glassamber':yield side,tri
    elif model=='timecar':
        if m=='red_glas':yield TAIL,tri
        elif m=='orange_glass':yield side,tri
        elif m=='light_glass' and z>1.85:yield (HEAD if y>-.15 else side),tri
    elif model=='interceptor':
        if m=='red_glass' and z< -1.8:yield TAIL,tri
        elif m=='orange_glass' and z< -1.8:yield side,tri
        elif m=='light_glass' and z>1.65:
            yield (HEAD if y>-.18 else FOG if y<-.27 else side),tri
    elif model=='enforcer':
        if m=='glass_light' and z>1.5 and dx<.16:yield (HEAD if y>-.13 else FOG if y<-.23 else side),tri
        elif m=='glass_light' and z< -1.8 and .1<y<.3:yield (TAIL if abs(x)<.62 else side),tri
        elif m=='red_glass' and z< -1.7 and y>-.13:yield TAIL,tri
    elif model=='mini':
        if n.startswith('lamps') and m=='headlightlens' and z>1.35:yield from split(HEAD,side,.84)
        elif m=='taillens' and z< -1.5:yield from split(TAIL,side,.78)
    elif model=='sierra':
        if m=='emiss' and z>2.4:yield (side if y>.10 else HEAD),tri
        elif m=='emiss' and z< -2.5:yield (side if abs(x)>.92 else TAIL),tri
        elif m=='glass_clear' and z>2.5 and y<-.30:yield FOG,tri
        elif m=='red_glass' and abs(x)<.2 and y>.60:yield STOP,tri
    elif model=='landcruiser':
        if 'red_glass' in m and z< -2:
            if abs(x)<.18:yield STOP,tri
            else:yield from split(TAIL,side,.80)
        elif 'glass_orange' in m and z>2:yield side,tri
        elif m=='lamp_glass' and z>2:yield (FOG if y<-.2 else HEAD),tri
    elif model=='fortuner':
        if m=='lamp_glass' and z>1.5 and y>-.2:yield from split(HEAD,side,.83)
        elif m=='lamp_glass' and z>1.7 and -.32<y<-.2:yield FOG,tri
        elif m=='fortuner_ext_red' and z< -1.6:yield from split(TAIL,side,.79)
    elif model=='cx30':
        if m=='redglass' and z< -1.5 and y>.12:
            if abs(x)<.20:yield STOP,tri
            else:yield from split(TAIL,side,.82)
        elif m=='clearglass' and z>1.5 and dx>.13 and y>-.18:yield from split(HEAD,side,.82)
        elif m=='clearglass' and z>1.5 and dx>.10 and y<-.3:yield FOG,tri

def plate_lip(lo,hi):
    cx=(lo[0]+hi[0])/2; y=hi[1]; z=lo[2]-.002
    corners=np.array([[cx-.09,y-.006,z],[cx+.09,y-.006,z],[cx+.09,y+.006,z],[cx-.09,y+.006,z]])
    return corners[[[0,1,2],[0,2,3]]]

def simplifier(path):
    shared=ctypes.CDLL(path or ctypes.util.find_library("meshoptimizer") or "libmeshopt.so")
    fn=shared.meshopt_simplify
    ptr,size=ctypes.c_void_p,ctypes.c_size_t
    fn.argtypes=[ptr,ptr,size,ptr,size,size,size,ctypes.c_float,ctypes.c_uint,ptr]
    fn.restype=size
    return fn

def encode(model,simplify):
    doc,buf=lod.read_source(ASSETS/(('supra_2020' if model=='supra' else model)+'.glb'))
    byrole=defaultdict(list);floor=999.;bumper=[];atlas=None;uv_by_position={}
    for name,mesh,t in lod.walk(doc):
        for p in mesh['primitives']:
            mat=doc['materials'][p['material']]['name']
            pos=doc['accessors'][p['attributes']['POSITION']]
            corners=np.array([[x,y,z] for x in [pos['min'][0],pos['max'][0]] for y in [pos['min'][1],pos['max'][1]] for z in [pos['min'][2],pos['max'][2]]])
            floor=min(floor,(corners@t[:3,:3].T+t[:3,3])[:,1].min())
            if model=='ae86' and name=='Body' and mat.startswith(('Trim','Secondary','Primary')):
                v,f,_=vertices(doc,buf,p,t);bumper.extend(v[f][v[f].mean(1)[:,2]>1.8])
            if not wanted(model,name,mat):continue
            v,f,uv=vertices(doc,buf,p,t)
            if model=='camaro' and name.startswith('TAILLIGHT_LENS') and uv is not None:
                for key,st in zip(np.rint(v*1000).astype(int),uv):uv_by_position[tuple(key)]=st
                if atlas is None:
                    texture=doc['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
                    tex=doc['textures'][texture];source=tex.get('extensions',{}).get('EXT_texture_webp',tex)['source']
                    view=doc['bufferViews'][doc['images'][source]['bufferView']];off=view.get('byteOffset',0)
                    image=Image.open(BytesIO(buf[off:off+view['byteLength']])).convert('RGB').resize((128,128),Image.Resampling.LANCZOS)
                    rgb=np.asarray(image,dtype=float)/255
                    # Keep the two red chambers and their dark dividers. Clear reverse
                    # strips never become red when the driver steps on the brake.
                    atlas=np.clip((rgb[:,:,0]-np.max(rgb[:,:,1:],axis=2)-.11)*2.8,0,1)
            for tri in components(v,f):
                for k,subset in sections(model,name,mat,tri):
                    if len(subset):byrole[k].append(subset)
    if model=='ae86':
        # The reference car has low amber fog units. Place each front face on the
        # exported bumper by intersecting a longitudinal ray at each corner.
        tri=np.array(bumper)
        for cx in (-.55,.50):
            points=[]
            for x,y in [(cx-.085,.29),(cx+.085,.29),(cx+.085,.36),(cx-.085,.36)]:
                a=tri[:,0];u=tri[:,1]-a;v=tri[:,2]-a;dx=x-a[:,0];dy=y-a[:,1];det=u[:,0]*v[:,1]-u[:,1]*v[:,0]
                valid=abs(det)>1e-8;one=(dx*v[:,1]-dy*v[:,0])/np.where(valid,det,1);two=(u[:,0]*dy-u[:,1]*dx)/np.where(valid,det,1)
                hit=valid&(one>=0)&(two>=0)&(one+two<=1)
                if not hit.any():break
                points.append([x,y,(a[:,2]+one*u[:,2]+two*v[:,2])[hit].max()+.004])
            if len(points)==4:byrole[FOG].append(np.array(points)[[[0,1,2],[0,2,3]]])
    # Keep source contours and compress the original triangles to millimetres.
    vertices_out=[]; indices=[]; codes=[]; bounds={}
    for k,parts in sorted(byrole.items()):
        points=np.concatenate(parts).reshape(-1,3)
        mm=np.rint(points*1000).astype('<i2')
        if len(points)>2400:
            # Weld nearby render vertices inside each lens category; keep one actual
            # source point per cell. Every retained vertex still lies on the GLB.
            _,first,ids=np.unique(np.round(mm/5).astype('<i2'),axis=0,return_index=True,return_inverse=True)
            xyz=mm[first]
        else:
            xyz,ids=np.unique(mm,axis=0,return_inverse=True)
        ix=ids.ravel().reshape(-1,3)
        ix=ix[(ix[:,0]!=ix[:,1])&(ix[:,0]!=ix[:,2])&(ix[:,1]!=ix[:,2])]
        if not len(ix):continue
        if len(ix)>400:
            # Reduce inner tessellation but retain the measured silhouette.
            flat=np.ascontiguousarray(ix.ravel(),dtype="u4")
            coords=np.ascontiguousarray(xyz,dtype="f4")
            result=np.empty_like(flat)
            size=simplify(result.ctypes.data,flat.ctypes.data,len(flat),coords.ctypes.data,len(xyz),12,
                          3*max(100,len(ix)//9),.0015,0,None)
            ix=result[:size].reshape(-1,3)

        used,remap=np.unique(ix,return_inverse=True); xyz=xyz[used]
        indices.extend(remap.ravel()+len(codes));codes.extend([k]*len(xyz));vertices_out.append(xyz)
        bounds[k]=[xyz.min(0).tolist(),xyz.max(0).tolist()]
    assert len(codes)<65536 and (HEAD in bounds or POPUP in bounds)
    assert TAIL in bounds and LEFT in bounds and RIGHT in bounds,(model,bounds.keys())
    def b64(array):return base64.b64encode(array.tobytes()).decode()
    all_xyz=np.concatenate(vertices_out)
    roles=np.array(codes,dtype='u1')
    head=all_xyz[(roles==HEAD)|(roles==POPUP)]/1000
    mounts=[((head[head[:,0]*side>0].min(0)+head[head[:,0]*side>0].max(0))/2).round(4).tolist() for side in (1,-1)]
    print(model,round(floor,3),sorted(bounds),len(indices)//3,flush=True)
    extra={}
    if atlas is not None:
        uv=np.array([uv_by_position.get(tuple(p),(0,0)) for p in all_xyz])
        extra={'uv':b64(np.rint((uv%1)*65535).astype('<u2')),'mask':b64(np.rint(atlas*255).astype('u1'))}
    return dict(**extra,floor=round(float(floor),5),mounts=mounts,xyz=b64(all_xyz),role=b64(roles),indices=b64(np.array(indices,dtype='<u2')))

if __name__=='__main__':
    models=[m for m in lod.MODELS if m not in ('tank','patrolclassic')]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--meshoptimizer',help='Path to a meshoptimizer shared library')
    simplify=simplifier(parser.parse_args().meshoptimizer)
    OUTPUT.write_text(json.dumps({m:encode(m,simplify) for m in models},separators=(',',':'))+'\n')
