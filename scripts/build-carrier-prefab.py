"""Bake the static, texture-free Big E into one draw and measure its flight deck."""
from pathlib import Path
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "frontend/public/models/vehicles/big_e_cvn65.glb"
blob = source.read_bytes()
length = struct.unpack_from("<I", blob, 12)[0]
src = json.loads(blob[20:20+length])
buf = blob[28+length:]
def read(index):
    a = src["accessors"][index]
    view = src["bufferViews"][a["bufferView"]]
    dtype = np.dtype({5123:"<u2",5125:"<u4",5126:"<f4"}[a["componentType"]])
    width = {"VEC3":3,"SCALAR":1}[a["type"]]
    return np.ndarray((a["count"],width),dtype,buf,view.get("byteOffset",0)+a.get("byteOffset",0),
                      (view.get("byteStride",width*dtype.itemsize),dtype.itemsize))
def rotation(q):
    x,y,z,w=q
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                     [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                     [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
# Remove the model's one-degree longitudinal deck pitch before building colliders.
angle = np.radians(-1.0)
level = rotation([np.sin(angle/2),0,0,np.cos(angle/2)])
positions=[]; normals=[]; colors=[]; faces=[]; count=0
for node in src["nodes"]:
    transform=rotation(node.get("rotation",[0,0,0,1]))
    for prim in src["meshes"][node["mesh"]]["primitives"]:
        a=prim["attributes"]
        p=(read(a["POSITION"])*node.get("scale",[1,1,1]))@transform.T+node.get("translation",[0,0,0])
        p=p@level.T
        p[:,1]-=46.12
        n=read(a["NORMAL"])@transform.T@level.T
        idx=read(prim["indices"]).reshape(-1,3).astype(np.uint32)
        c=np.tile([.28,.33,.36],(len(p),1))
        c[p[:,1]<-4]=[.16,.21,.23]
        c[(abs(p[:,1])<.55)&(n[:,1]>.9)]=[.11,.14,.16]
        positions.append(p);normals.append(n);colors.append(c);faces.append(idx+count)
        count+=len(p)
p=np.concatenate(positions); n=np.concatenate(normals); c=np.concatenate(colors); f=np.concatenate(faces)
lo=p.min(axis=0);hi=p.max(axis=0); center=(lo+hi)/2; size=hi-lo
p[:,0]-=center[0];p[:,2]-=center[2]
tri=p[f]
deck=tri[(abs(tri[:,:,1]).max(axis=1)<.55)&(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])[:,1]>0)]
def span(z):
    segments=[]
    for a,b in [(0,1),(1,2),(2,0)]:
        v,u=deck[:,a],deck[:,b]; mask=(v[:,2]>z)!=(u[:,2]>z)
        v,u=v[mask],u[mask]
        segments.extend(v[:,0]+(u[:,0]-v[:,0])*(z-v[:,2])/(u[:,2]-v[:,2]))
    return (min(segments),max(segments)) if segments else None
def box(x,y,z,w,h,d):
    return {"shape":"box","position":np.round([x/size[0],y/size[1],z/size[2]],6).tolist(),
            "size":np.round([w/size[0],h/size[1],d/size[2]],6).tolist()}
parts=[]
zs=np.linspace(deck[:,:,2].min()+1,deck[:,:,2].max()-1,21)
for a,b in zip(zs,zs[1:]):
    samples=[span(a+.01),span((a+b)/2),span(b-.01)]
    if None in samples:continue
    left=max(s[0] for s in samples); right=min(s[1] for s in samples)
    if right-left>1:parts.append(box((left+right)/2,-3,(a+b)/2,right-left,6,b-a))
# Measure the island separately; the road deck remains usable around it.
island=p[p[:,1]>19]
a,b=np.quantile(island,[.03,.97],axis=0)
parts.append(box((a[0]+b[0])/2,12,(a[2]+b[2])/2,b[0]-a[0],24,b[2]-a[2]))
catalog={"size":np.round(size*.66,4).tolist(),"parts":parts}
(ROOT/"frontend/src/worldBuilder/generation/carrierDeck.json").write_text(json.dumps(catalog,indent=2)+"\n")
# The upload has no embedded deck texture. Bake restrained runway markings into
# the same primitive: two edges, a broken centerline and a landing threshold.
markings=[(-13,0,.45,310),(13,0,.45,310)]
markings.extend((0,z,.7,8) for z in range(-140,150,20))
markings.extend((x,-144,2,8) for x in [-8,-4,4,8])
for x,z,width,length in markings:
    start=len(p);h=.42
    corners=np.array([[x-width/2,h,z-length/2],[x-width/2,h,z+length/2],
                      [x+width/2,h,z+length/2],[x+width/2,h,z-length/2]])
    p=np.concatenate([p,corners]);n=np.concatenate([n,np.tile([0.,1.,0.],(4,1))])
    c=np.concatenate([c,np.tile([.64,.64,.56],(4,1))])
    f=np.concatenate([f,np.array([[start,start+1,start+2],[start,start+2,start+3]],dtype=np.uint32)])
g={"asset":{"version":"2.0","generator":"AvenLab static carrier baker"},"scene":0,"scenes":[{"nodes":[0]}],
   "nodes":[{"mesh":0,"name":"Big E CVN-65"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"indices":3,"material":0}]}],
   "materials":[{"pbrMetallicRoughness":{"metallicFactor":.18,"roughnessFactor":.83}}],
   "buffers":[],"bufferViews":[],"accessors":[]}
data=bytearray()
for i,arr in enumerate([(p/size).astype("<f4"),n.astype("<f4"),np.round(c*255).astype("u1"),f.ravel().astype("<u4")]):
    if i==2:arr=np.column_stack([arr,np.full(len(arr),255,dtype="u1")])
    offset=len(data);data.extend(arr.tobytes());length=len(data)-offset
    g["bufferViews"].append({"buffer":0,"byteOffset":offset,"byteLength":length,"target":34963 if i==3 else 34962})
    access={"bufferView":i,"type":["VEC3","VEC3","VEC4","SCALAR"][i],"count":len(arr),"componentType":[5126,5126,5121,5125][i]}
    if i==2:access["normalized"]=True
    if i==0:access.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
    g["accessors"].append(access);data.extend(bytes(-len(data)%4))
g["buffers"]=[{"byteLength":len(data)}]
raw=json.dumps(g,separators=(",",":")).encode();raw+=b" "*(-len(raw)%4)
out=ROOT/"frontend/public/models/world/big-e-docked.glb"
out.write_bytes(struct.pack("<4sIIII",b"glTF",2,28+len(raw)+len(data),len(raw),0x4e4f534a)+raw+struct.pack("<II",len(data),0x004e4942)+data)
print(len(f),"triangles,",len(parts),"collision shapes,",len(data),"bytes, deck spans",span(0), "island",a,b)
