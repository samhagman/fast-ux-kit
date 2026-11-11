import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const fixture = await mkdtemp(join(tmpdir(), "fast-ux-consumer-"));
const run = (command, args, cwd = fixture) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
try {
  run("npm", ["run", "build"], root);
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", fixture], root))[0];
  const paths = packed.files.map((file) => file.path);
  for (const required of [
    "dist/core/index.js",
    "dist/components/index.js",
    "dist/editorial/index.js",
    "dist/editorial/index.d.ts",
    "dist/editorial.css",
    "dist/outliner/index.d.ts",
    "dist/machine-graph/index.js",
    "dist/machine-view/index.js",
    "dist/machine-tree/index.js",
    "dist/library.css",
    "LICENSE.md",
    "CONTRIBUTING.md",
    "NOTICE.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.ok(paths.includes(required), `Missing packed file ${required}`);
  }
  assert.ok(
    paths.every((path) =>
      /^(dist\/|docs\/|README\.md$|LICENSE\.md$|CONTRIBUTING\.md$|NOTICE\.md$|THIRD_PARTY_NOTICES\.md$|package\.json$)/.test(
        path,
      ),
    ),
    "Package file allowlist",
  );
  assert.ok(
    paths.every((path) => !/\.map$|(?:^|\/)\.claude|research|^dist\/(aria|ark)\//i.test(path)),
    "Private files and retired entries excluded",
  );
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({ name: "fast-ux-consumer-smoke", private: true, type: "module" }),
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(fixture, packed.filename),
    "react@19.2.6",
    "react-dom@19.2.6",
    "typescript@5.9.3",
    "@types/react@19.2.14",
    "@types/react-dom@19.2.3",
    "@types/node@22.19.19",
    "jsdom@26.1.0",
    "esbuild@0.25.12",
  ]);
  await writeFile(
    join(fixture, "consumer.tsx"),
    `
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { validateOutline, createOutlineEditorState, reduceOutlineEditor } from '@samhagman/fast-ux-kit/core';
import { Button, ColorPicker, DatePicker, componentManifest } from '@samhagman/fast-ux-kit/components';
import { Outliner, OutlinerWorkspace, type OutlineItem, type OutlinerHandle, type OutlineWorkspaceSnapshot, createNotePageRegistry, defineNotePageExtension, NotePageView, type NotePageType, type OutlineCollaboration, type OutlineFieldEvent } from '@samhagman/fast-ux-kit/outliner';
import { MachineGraphView } from '@samhagman/fast-ux-kit/machine-graph';
import { MachineView as DeprecatedMachineView, type MachineViewProps } from '@samhagman/fast-ux-kit/machine-view';
import { MachineTree } from '@samhagman/fast-ux-kit/machine-tree';
import { Article, ArticleBody, CodeBlock, Figure, MarginNote, editorialManifest, tokenizeCode } from '@samhagman/fast-ux-kit/editorial';
import { createMachineSnapshot, type MachineDocument } from '@samhagman/fast-ux-kit/machine';
import * as legacyReader from '@samhagman/fast-ux-kit/react';
import * as rich from '@samhagman/fast-ux-kit/rich';
import * as root from '@samhagman/fast-ux-kit';
const nodes: readonly OutlineItem[] = [{id:'one',text:'One'}];
const updateItem: OutlinerHandle['updateItem'] = (_id,changes) => typeof changes.data?.note === 'string';
assert.equal(updateItem('one',{data:{note:'Stored attachment'}}),true);
assert.deepEqual(validateOutline(nodes),[]);
const state = reduceOutlineEditor(createOutlineEditorState(nodes), {type:'text',id:'one',text:'Two'}, {readOnly:false});
assert.equal(state.nodes[0]?.text,'Two');
const machine: MachineDocument = {version:1,rootId:'main',machines:[{id:'main',label:'Consumer machine',nodes:[{id:'idle',kind:'atomic',label:'Idle'}],transitions:[]}]};
assert.deepEqual(createMachineSnapshot(machine).activeIds,['idle']);
assert.equal(componentManifest.length,92);
for (const entry of [OutlinerWorkspace, MachineGraphView, MachineTree, legacyReader.OutlineEditor, rich, root]) assert.ok(entry);
const acceptWorkspace = (event: OutlineWorkspaceSnapshot) => event.documents;
assert.equal(typeof acceptWorkspace,'function');
assert.match(renderToString(<Button>Save</Button>),/Save/);
assert.match(renderToString(<ColorPicker label="Accent" defaultValue="#225544"/>),/Accent/);
assert.match(renderToString(<DatePicker label="Due"/>),/Due/);
assert.match(renderToString(<Outliner defaultValue={nodes}/>),/One/);
const collaboration: OutlineCollaboration = {canUndo:false,canRedo:false,undo(){},redo(){},mapCaret:caret=>caret,onFieldEvent:(event:OutlineFieldEvent)=>void event.anchor};
assert.match(renderToString(<Outliner value={nodes} collaboration={collaboration} onValueChange={(_nodes,meta)=>{void meta.base;void meta.operation;void meta.beforeCaret;void meta.afterCaret;}}/>),/One/);
assert.match(renderToString(<MachineTree document={machine}/>),/Consumer machine/);
assert.match(renderToString(<MachineGraphView defaultDocument={machine}/>),/Consumer machine/);
// The old entry and names still resolve to the renamed component.
assert.equal(DeprecatedMachineView, MachineGraphView);
const oldProps: MachineViewProps = { defaultDocument: machine };
assert.ok(oldProps);
assert.equal(editorialManifest.length,35);
assert.equal(tokenizeCode('const a = 1','ts')[0]?.[0]?.kind,'keyword');
const page = renderToString(<Article><ArticleBody><p>Body<MarginNote>Aside</MarginNote></p><Figure caption="What to notice"><CodeBlock code={'const a = 1'} language="ts" filename="a.ts"/></Figure></ArticleBody></Article>);
assert.match(page,/What to notice/);
assert.doesNotMatch(page,/ style=/);
const textPage: NotePageType<{text:string}> = {type:'consumer.text',label:'Text',version:1,create:()=>({text:'Portable page'}),validate:(value):value is {text:string}=>!!value && typeof value==='object' && typeof (value as {text?:unknown}).text==='string'};
const pages=createNotePageRegistry([textPage]);
const textExtension=defineNotePageExtension(textPage,({data,readOnly,onChange})=><textarea value={data.text} readOnly={readOnly} onChange={event=>onChange({text:event.target.value})}/>);
assert.match(renderToString(<NotePageView page={pages.create('consumer.text','page')} extensions={[textExtension]}/>),/Portable page/);
console.log('Public entries, declarations and server rendering pass.');
`,
  );
  run(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--jsx",
    "react-jsx",
    "--types",
    "node",
    "--outDir",
    "output",
    "consumer.tsx",
  ]);
  console.log(run(process.execPath, ["output/consumer.js"]).trim());
  await writeFile(
    join(fixture, "hydrate.mjs"),
    `
import assert from 'node:assert/strict';
import { createElement as h, act } from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Button } from '@samhagman/fast-ux-kit/components';
import { Outliner } from '@samhagman/fast-ux-kit/outliner';
import { MachineGraphView } from '@samhagman/fast-ux-kit/machine-graph';
import { MachineTree } from '@samhagman/fast-ux-kit/machine-tree';
import { Outliner as Reader, RichContent } from '@samhagman/fast-ux-kit/react';
import { importMarkdownDocument } from '@samhagman/fast-ux-kit/rich';
const nodes=[{id:'one',text:'Hydration note'}];
const machine={version:1,rootId:'main',machines:[{id:'main',label:'Hydration machine',initialId:'idle',regions:{work:{label:'Working'}},nodes:[{id:'idle',kind:'atomic',label:'Idle'},{id:'run',kind:'atomic',label:'Running',region:'work'},{id:'retry',kind:'atomic',label:'Retrying',region:'work'},{id:'done',kind:'final',label:'Done'}],transitions:[{id:'go',sourceId:'idle',targetId:'run',event:'GO'},{id:'skip',sourceId:'idle',targetId:'done',event:'SKIP'},{id:'fail',sourceId:'run',targetId:'retry',event:'FAIL'},{id:'again',sourceId:'retry',targetId:'run',event:'AGAIN'},{id:'ok',sourceId:'run',targetId:'done',event:'OK'}]}]};
let clicks=0;
const views=[
 h(Button,{onClick:()=>clicks++},'Hydrated button'),
 h(Reader,{nodes}),
 h(RichContent,{document:importMarkdownDocument('# Hydration rich text')}),
 h(Outliner,{defaultValue:nodes,readOnly:true}),
 h(MachineGraphView,{defaultDocument:machine,readOnly:true}),
 h(MachineTree,{document:machine}),
];
const html=views.map((view,index)=>'<div id="root-'+index+'">'+renderToString(view)+'</div>').join('');
const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://consumer.test'});
for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','SVGElement','Element','Node','MutationObserver','Event','MouseEvent','KeyboardEvent','DocumentFragment']) Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
for(const name of ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[name]=dom.window[name].bind(dom.window);
Object.defineProperty(dom.window,'innerWidth',{value:390,configurable:true});
dom.window.matchMedia=query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
globalThis.ResizeObserver=dom.window.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
globalThis.CSS={escape:value=>String(value),supports:()=>false};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.HTMLElement.prototype.scrollTo=function(){};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {hydrateRoot}=await import('react-dom/client');
const errors=[];
const roots=[];
await act(async()=>{
 for(const [index,view] of views.entries()) roots.push(hydrateRoot(document.getElementById('root-'+index),view,{onRecoverableError:error=>errors.push(error)}));
 await new Promise(resolve=>setTimeout(resolve,80));
});
await act(async()=>document.querySelector('#root-0 button').click());
assert.equal(clicks,1); assert.deepEqual(errors,[]);
assert.match(document.body.textContent,/Hydration note/);
assert.match(document.body.textContent,/Hydration machine/);
await act(async()=>roots.forEach(root=>root.unmount())); dom.window.close();
for(const name of ['core','components','editorial','outliner','machine','machine-graph','machine-view','machine-tree','react','rich']) await import('@samhagman/fast-ux-kit/'+name);
for(const name of ['aria','ark','components/aria']) {
 await assert.rejects(import('@samhagman/fast-ux-kit/'+name),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
}
for(const name of ['styles.css','components.css','editorial.css','tokens.css','outliner.css','machine.css','machine-graph.css','machine-view.css','machine-tree.css']) assert.ok(import.meta.resolve('@samhagman/fast-ux-kit/'+name).endsWith('.css'));
console.log('Hydration, retired-entry rejection and compiled style resolution pass.');
`,
  );
  console.log(run(process.execPath, ["hydrate.mjs"]).trim());
  const dependencyTree = run("npm", ["ls", "--all", "--json"]);
  assert.doesNotMatch(
    dependencyTree,
    /"(?:react-aria-components|@react-aria\/[^" ]+|@ark-ui\/react|@zag-js\/[^" ]+|radix-ui|@radix-ui\/[^" ]+|cmdk|vaul|sonner)"\s*:/,
  );
  console.log(
    `Independent tarball passed with ${paths.length} allowlisted files (${packed.size} compressed bytes).`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  throw error;
} finally {
  await rm(fixture, { recursive: true, force: true });
}
