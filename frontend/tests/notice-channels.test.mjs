import test from 'node:test';
import assert from 'node:assert/strict';
import {channelForTone,sanitizeNoticeChannels,NOTICE_CHANNELS} from '../src/combat/noticeModel.ts';

test('buff, debuff and damage notices follow the same semantic channel scheme',()=>{
 assert.equal(channelForTone('buff'),'effects');
 assert.equal(channelForTone('debuff'),'effects');
 assert.equal(channelForTone('damage'),'combat');
 assert.equal(channelForTone('warning'),'system');
 assert.equal(channelForTone('rescue'),'rescue');
});

test('old or damaged saved settings preserve safe default notification visibility',()=>{
 const clean=sanitizeNoticeChannels({effects:false,combat:'disabled',unknown:false});
 assert.equal(clean.effects,false);
 assert.equal(clean.combat,true);
 assert.deepEqual(Object.keys(clean),[...NOTICE_CHANNELS]);
});
