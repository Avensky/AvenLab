import type {InstancedMesh, Matrix4} from 'three';

/** Reuse the GPU buffer when the displayed transform has not moved. */
export function writeInstanceMatrix(batch:InstancedMesh,index:number,matrix:Matrix4) {
  const values = batch.instanceMatrix.array;
  const offset = index * 16;
  for (let i=0;i<16;i++){
    if (values[offset+i] !== Math.fround(matrix.elements[i])) {
      batch.setMatrixAt(index,matrix);
      return true;
    }
  }
  return false;
}
