import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {onNavalDeck} from '../src/combat/navalDeckHold.ts';

const vessel={id:'rescue',vehicle_id:'hawaii-rescue',position:[0,-6,-100],rotation:[0,0,0,1]};
const car={id:'driver',vehicle_id:'brz',position:[0,-.2,-100]};
test('a vehicle actually on the Hawaii deck receives the landing assist',()=>{
 assert.equal(onNavalDeck(car,{entities:[vessel,car]}),true);
 assert.equal(onNavalDeck({...car,position:[25,-.2,-100]},{entities:[vessel,car]}),false);
 assert.equal(onNavalDeck({...car,position:[0,12,-100]},{entities:[vessel,car]}),false);
 assert.equal(onNavalDeck(vessel,{entities:[vessel]}),false);
});
test('the landing buff clears when the rescue vessel is absent',()=>{
 assert.equal(onNavalDeck(car,{entities:[car]}),false);
 assert.equal(onNavalDeck(car,null),false);
});
