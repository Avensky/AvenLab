import bpy,json,sys,math,pathlib
from mathutils import Vector
src=pathlib.Path(sys.argv[sys.argv.index('--')+1]);dst=src/'renders';dst.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.world.color=(.4,.4,.4);scene.view_settings.view_transform='Standard'
def mat(name,color):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8;return m
for loc,power,size in [((2,-3,4),350,4),((-2,-1,2),150,3),((0,2,3),250,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=power;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=size;bpy.context.object.rotation_euler=(Vector((0,0,1.1))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.0,-2.8,1.24));camera=bpy.context.object;scene.camera=camera;camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.12
view=sys.argv[-1] if sys.argv[-1] in ('front','back') else 'front'
if view=='back':
 camera.location.y=2.8;camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler()
for file in sorted(src.glob('*.json')):
 if file.stem not in [f'{n}-none{fit}-{pose}' for n in range(1,6) for fit in ('','-long') for pose in ('idle','clap')]:continue
 for o in list(bpy.data.objects):
  if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
 for item in json.loads(file.read_text()):
  ps=item['points'];verts=[(ps[i],-ps[i+2],ps[i+1]) for i in range(0,len(ps),3)];idx=item['indices'];faces=[idx[i:i+3]for i in range(0,len(idx),3)];mesh=bpy.data.meshes.new(item['name']);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(item['name'],mesh);scene.collection.objects.link(obj)
  role=item.get('role') or '';color=(.5,.32,.22)if role=='body' else (.32,.38,.50)if role in ('bottom','skirt')else(.12,.22,.17)if role.startswith('corset')else(.8,.71,.56)if role.startswith('shirt')else(.1,.1,.15)if role=='shorts'else item['color']
  obj.data.materials.append(mat(role or item['name'],color))
  for poly in mesh.polygons:poly.use_smooth=True
 scene.render.filepath=str(dst/(file.stem+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
