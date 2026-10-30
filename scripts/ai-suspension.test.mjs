import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Executes the real component functions and their event closures with a small hook
// host. This is not a DOM/browser test; no source-string assertions stand in for events.
function host(entry, overrides = {}, storage = new Map()) {
  const states = [], effects = [], alerts = [], writes = [], removals = [], clips = [], blobs = [];
  let cursor = 0, requests = 0, reads = 0;
  const localStorage = {
    getItem(k) { reads++; if (/USER_.*(?:KEY|CODE)/.test(k)) throw Error('credential read forbidden'); return storage.get(k) ?? null; },
    setItem(k,v) { writes.push(k); storage.set(k,v); },
    removeItem(k) { removals.push(k); storage.delete(k); },
  };
  const react = {
    useState(init) {
      const i = cursor++;
      if (!(i in states)) states[i] = i in overrides ? overrides[i] : typeof init === 'function' ? init() : init;
      return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
    },
    useEffect(fn) { effects.push(fn); },
    useRef(v) { return {current:v}; },
    createElement(type, props, ...children) { return {type, props:{...props, children}}; },
  };
  const context = vm.createContext({
    console: {log(){}, warn(){}, error(){ throw Error('unexpected error logging'); }},
    fetch() { requests++; throw Error('network forbidden'); },
    XMLHttpRequest: class { constructor() { requests++; throw Error('network forbidden'); } },
    FileReader: class { constructor() { throw Error('file content must not be read'); } },
    localStorage, window: {localStorage}, alert: m => alerts.push(m), confirm: () => true,
    navigator: {clipboard:{writeText: async v => { clips.push(v); }}},
    Blob, URL: {createObjectURL(b) { blobs.push(b); return 'blob:test'; }},
    document: {createElement: () => ({setAttribute(){}, click(){}}), body:{appendChild(){}, removeChild(){}}},
    setTimeout(){}, clearTimeout(){}, crypto: {randomUUID: () => 'fixture-id'},
  });
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports:{}}; cache.set(file,module);
    const code = transformSync(fs.readFileSync(file,'utf8'), {loader:file.endsWith('tsx')?'tsx':'ts', format:'cjs', jsx:'automatic'}).code;
    const require = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
      if (name === 'lucide-react') return new Proxy({}, {get:(_,k)=>String(k)});
      if (!name.startsWith('.')) throw Error('unexpected dependency: '+name);
      const p=path.resolve(path.dirname(file),name);
      return load([p,p+'.ts',p+'.tsx'].find(f=>fs.existsSync(f)));
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`,context)(require,module,module.exports);
    return module.exports;
  }
  const exports=load(entry);
  return {exports, states, alerts, writes, removals, clips, blobs, storage,
    requests:()=>requests, reads:()=>reads,
    render(props={}) { cursor=0; effects.length=0; return exports.default(props); },
    effects() { effects.splice(0).forEach(f=>f()); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree,...nodes(tree.props?.children)];
}
function byId(tree,id) { const n=nodes(tree).find(n=>n.props?.id===id); assert.ok(n,`missing ${id}`); return n.props; }
const record={studentId:'fixture-a',studentName:'가상학생A',studentNumber:'1',gradesSummary:'연습',recordText:'기존 문장',editedText:'교사 수정본',isGenerating:false};
const keys=['USER_GEMINI_API_KEY','USER_OPENAI_API_KEY','USER_GROQ_API_KEY','USER_XAI_API_KEY','USER_ACCESS_CODE'];

for (const method of ['clientGenerateRecords','clientGenerateCreativeRecommendations','clientGenerateCreativeElements','clientParseTableImage']) {
  test(`${method}: direct invocation refuses without reading payload/storage/network`, async()=>{
    const h=host('src/services/aiService.ts');
    const input=new Proxy({}, {get(){throw Error('payload must not be inspected');}});
    for (const value of [undefined, null, input]) {
      const result=await h.exports[method](value);
      assert.equal(result.ok,false); assert.equal(result.code,'AI_TEMPORARILY_DISABLED');
      assert.equal(Object.isFrozen(result),true);
    }
    assert.equal(h.requests(),0); assert.equal(h.reads(),0);
  });
}
test('credential cleanup only deletes exact five keys, once per loaded storage',()=>{
  const data=new Map(keys.map(k=>[k,'synthetic-placeholder']));
  data.set('creative_accumulated_items','[]'); data.set('students','fixture'); data.set('USER_SELECTED_MODEL','choice');
  const h=host('src/services/aiSuspension.ts',{},data);
  const storage={removeItem:k=>{h.removals.push(k);data.delete(k);},getItem(){throw Error('read forbidden');},clear(){throw Error('clear forbidden');}};
  assert.equal(h.exports.removeLegacyCredentials(storage),true);
  assert.equal(h.exports.removeLegacyCredentials(storage),true);
  assert.deepEqual(h.removals,keys); assert.equal(data.size,3); assert.equal(data.get('students'),'fixture');
});
test('cleanup failure is reported, no raw exception escapes, later retry works',()=>{
  const h=host('src/services/aiSuspension.ts'); let deny=true; let calls=0;
  const storage={removeItem(){calls++;if(deny)throw Error('synthetic private error');}};
  assert.equal(h.exports.removeLegacyCredentials(storage),false); assert.equal(calls,5);
  deny=false; assert.equal(h.exports.removeLegacyCredentials(storage),true); assert.equal(calls,10);
});
test('App mount removes old credentials without reinjecting them into React state',()=>{
  const data=new Map(keys.map(k=>[k,'synthetic-placeholder'])); data.set('creative_accumulated_items','[]');
  const h=host('src/App.tsx',{},data); h.render(); h.effects();
  const tree=h.render(); assert.deepEqual(h.removals,keys); assert.equal(h.reads(),0);
  assert.ok(!JSON.stringify(h.states).includes('synthetic-placeholder'));
  byId(tree,'btn-toggle-key-panel').onClick();
  assert.ok(!nodes(h.render()).some(n=>n.type==='input' && n.props.type==='password'));
  assert.equal(data.get('creative_accumulated_items'),'[]');
});
for (const step of ['config','results']) test(`App ${step}: generation/regeneration preserves existing edits and roster`,()=>{
  const h=host('src/App.tsx',{0:step,5:[{id:'fixture-a',name:'가상학생A',number:'1',grades:{}}],8:[record]});
  const tree=h.render(), before=JSON.stringify(h.states);
  if(step==='config') byId(tree,'btn-run-generate').onClick();
  else { const n=nodes(tree).find(n=>n.props?.onRegenerateAll); assert.ok(n); n.props.onRegenerateAll(); }
  assert.equal(JSON.stringify(h.states),before); assert.equal(h.alerts.length,1); assert.equal(h.requests(),0);
});
test('Creative generation and element recommendation preserve results and collection',()=>{
  const group=[{element:'연습',items:[{id:1,recommendedText:'교사 수정본'}]}];
  const store=JSON.stringify([{id:'saved',domain:'자율활동',topic:'연습',element:'연습',text:'보관 문장'}]);
  const h=host('src/components/CreativePlayground.tsx',{3:'가상 주제',5:true,15:group},new Map([['creative_accumulated_items',store]]));
  const tree=h.render(), before=JSON.stringify(h.states);
  const buttons=nodes(tree).filter(n=>['handleGenerate','handleGenerateElements'].includes(n.props?.onClick?.name));
  assert.equal(buttons.length,2); buttons.forEach(n=>n.props.onClick());
  assert.equal(JSON.stringify(h.states),before); assert.equal(h.storage.get('creative_accumulated_items'),store);
  assert.equal(h.requests(),0); assert.equal(h.alerts.length,2);
});
for(const name of ['SmartImportCenter','StudentTableInput']) test(`${name}: upload and drop refuse before reading file or changing student data`,()=>{
  const h=host(`src/components/${name}.tsx`,{0:name==='StudentTableInput'?'image':'ocr'});
  let changes=0;
  const props={criteria:[],students:[],evaluationMode:'subject',setStudents(){changes++;},setCriteria(){changes++;},onImportExcelSuccess(){changes++;}};
  const tree=h.render(props), file=new Proxy({}, {get(){throw Error('file must not be read');}});
  const input=nodes(tree).find(n=>n.type==='input'&&n.props.type==='file'); assert.ok(input);
  input.props.onChange({target:{files:[file]}});
  const drop=nodes(tree).find(n=>n.props?.onDrop); assert.ok(drop);
  drop.props.onDrop({preventDefault(){},stopPropagation(){},dataTransfer:{files:[file]}});
  assert.equal(changes,0); assert.equal(h.requests(),0); assert.equal(h.reads(),0);
  assert.ok(JSON.stringify(h.states).includes('일시 중지'));
});
test('manual student add and edit still execute',()=>{
  const h=host('src/components/StudentTableInput.tsx'); let students=[];
  const props={criteria:[],students,evaluationMode:'subject',maskingStyle:'none',setStudents:v=>{students=typeof v==='function'?v(students):v;}};
  let tree=h.render(props);
  const add=nodes(tree).find(n=>n.props?.onClick?.name==='handleAddStudent'); assert.ok(add); add.props.onClick();
  assert.equal(students.length,1); props.students=students; tree=h.render(props);
  const input=nodes(tree).find(n=>n.type==='input'&&n.props.value===students[0].name&&n.props.onChange); assert.ok(input);
  input.props.onChange({target:{value:'가상학생B'}}); assert.equal(students[0].name,'가상학생B');
});
for(const name of ['SmartImportCenter','StudentTableInput']) test(`${name}: pasted table remains local`,()=>{
  const h=host(`src/components/${name}.tsx`,{0:name==='SmartImportCenter'?'excel':'paste',1:'번호\t이름\t연습\n1\t가상학생A\t잘함'});
  let imported;
  const tree=h.render({criteria:[],students:[],evaluationMode:'subject',onAdvanceToStep(){},onImportExcelSuccess:(...v)=>{imported=v;}});
  const n=nodes(tree).find(n=>n.props?.onClick?.name?.startsWith('handleParsePaste')); assert.ok(n); n.props.onClick();
  assert.equal(imported[1][0].name,'가상학생A'); assert.equal(h.requests(),0);
});
test('existing result edit, copy and CSV retain teacher text',async()=>{
  const h=host('src/components/RecordsDashboard.tsx'); let records=[{...record}];
  const props={records,config:{subject:'연습',maxLength:180},maskingStyle:'none',setRecords:v=>{records=typeof v==='function'?v(records):v;}};
  let tree=h.render(props); byId(tree,'btn-start-record-edit-fixture-a').onClick(); tree=h.render(props);
  byId(tree,'edit-record-textarea-fixture-a').onChange({target:{value:'새 교사 수정본'}});
  tree=h.render(props); byId(tree,'btn-save-record-edit-fixture-a').onClick(); props.records=records; tree=h.render(props);
  byId(tree,'btn-copy-all').onClick(); byId(tree,'btn-export-csv').onClick();
  assert.equal(records[0].editedText,'새 교사 수정본'); assert.ok(h.clips[0].includes('새 교사 수정본'));
  assert.ok((await h.blobs[0].text()).includes('새 교사 수정본')); assert.equal(h.requests(),0);
});
test('creative edit, copy, CSV and collection add/delete persist without AI',async()=>{
  const group=[{element:'연습',items:[{id:1,recommendedText:'기존 창체 문장'}]}];
  const saved=[{id:'saved',domain:'자율활동',topic:'연습',element:'연습',text:'기존 보관 문장'}];
  const h=host('src/components/CreativePlayground.tsx',{15:group},new Map([['creative_accumulated_items',JSON.stringify(saved)]]));
  let tree=h.render();
  const clickTitle=title=>{const n=nodes(tree).find(n=>n.props?.title===title);assert.ok(n,title);n.props.onClick();};
  const clickHandler=name=>{const n=nodes(tree).find(n=>n.props?.onClick?.name===name);assert.ok(n,name);n.props.onClick();};
  clickTitle('수동 수정'); tree=h.render();
  const textarea=nodes(tree).find(n=>n.type==='textarea'&&n.props.value==='기존 창체 문장');assert.ok(textarea);
  textarea.props.onChange({target:{value:'보존할 창체 수정본'}}); tree=h.render();
  const save=nodes(tree).find(n=>n.type==='button'&&n.props.children==='저장');assert.ok(save);save.props.onClick(); tree=h.render();
  clickHandler('handleCopyAllActiveGroup'); clickHandler('handleExportCSV'); clickHandler('handleAddAllActiveGroupToAccumulation');
  tree=h.render(); h.effects(); tree=h.render();
  assert.equal(JSON.parse(h.storage.get('creative_accumulated_items')).length,2);
  clickHandler('handleExportAccumulatedCSV');
  assert.ok(h.clips[0].includes('보존할 창체 수정본'));
  assert.ok((await h.blobs[0].text()).includes('보존할 창체 수정본'));
  const csv=await h.blobs[1].text();assert.ok(csv.includes('기존 보관 문장'));assert.ok(csv.includes('보존할 창체 수정본'));
  clickTitle('이 행만 보관함에서 삭제합니다'); tree=h.render(); h.effects();
  const remaining=JSON.parse(h.storage.get('creative_accumulated_items'));
  assert.equal(remaining.length,1); assert.equal(remaining[0].text,'보존할 창체 수정본');
  assert.equal(h.requests(),0);assert.ok(h.writes.every(k=>k==='creative_accumulated_items'));
});
