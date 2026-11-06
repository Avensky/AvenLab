import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {recordedNavalRoute} from '../src/worldBuilder/generation/navalRoutes.ts';

test('placed boat markers preserve authored traversal order and elevation',()=>{
  const points=[
    {id:'wp-1',piece:'naval-route-waypoint',position:[0,-8,-200],yaw:0},
    {id:'street',piece:'coastal-road',position:[10,0,10],yaw:0},
    {id:'wp-2',piece:'naval-route-waypoint',position:[0,-8,0],yaw:45},
  ];
  assert.deepEqual(recordedNavalRoute(points),[
    {id:'wp-1',position:[0,-8,-200],heading:0},
    {id:'wp-2',position:[0,-8,0],heading:45},
  ]);
});
