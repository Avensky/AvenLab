import {Mesh,Vector3} from 'three';

/** The FR-S/BRZ export bakes camber into each wheel's vertices. The broad, flat
 * faces of the brake rotor give the actual axis without relying on its pivot. */
export function brzWheelAxle(disc?:Mesh) {
  const axle=new Vector3(1,0,0);
  if (!disc) return axle;
  const {index}=disc.geometry, points=disc.geometry.getAttribute('position');
  if (!points) return axle;
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),sum=new Vector3();
  const count=index?.count ?? points.count;
  for (let i=0;i+2<count;i+=3) {
    a.fromBufferAttribute(points,index?index.getX(i):i);
    b.fromBufferAttribute(points,index?index.getX(i+1):i+1).sub(a);
    c.fromBufferAttribute(points,index?index.getX(i+2):i+2).sub(a);
    const normal=b.cross(c);
    if (Math.abs(normal.x)>=normal.length()*.998) sum.addScaledVector(normal,Math.sign(normal.x));
  }
  if (sum.lengthSq()<1e-10) return axle;
  disc.updateWorldMatrix(true,false);
  axle.copy(sum).transformDirection(disc.matrixWorld);
  if (axle.x<0) axle.negate();
  return axle;
}
