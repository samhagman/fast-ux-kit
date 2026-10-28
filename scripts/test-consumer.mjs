import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(new URL("..", import.meta.url).pathname);
const fixture = await mkdtemp(join(tmpdir(), "fast-ux-consumer-"));
const cache = join(tmpdir(), "fast-ux-consumer-npm-cache");
const run = (command, args, cwd = fixture) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
    stdio: ["ignore", "pipe", "pipe"],
  });
try {
  run("npm", ["run", "build"], root);
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", fixture], root))[0];
  const paths = packed.files.map((file) => file.path);
  assert.ok(paths.includes("dist/index.js"));
  assert.ok(paths.includes("dist/components/index.d.ts"));
  assert.ok(paths.includes("dist/components/ark-specialized.css"));
  assert.ok(paths.includes("dist/components/ark-advanced.css"));
  assert.ok(
    paths.every((path) => /^(dist\/|docs\/|README\.md$|NOTICE\.md$|package\.json$)/.test(path)),
    `Unexpected package files: ${paths}`,
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
    "react-aria-components@1.22.1",
  ]);
  await writeFile(
    join(fixture, "without-ark.mjs"),
    `import assert from 'node:assert/strict';
import {validateOutline} from '@samhagman/fast-ux-kit/core';
import {Outliner} from '@samhagman/fast-ux-kit';
import {Button} from '@samhagman/fast-ux-kit/aria';
import {Button as StyledButton, ColorPicker, DatePicker, Select, Primitives} from '@samhagman/fast-ux-kit/components/aria';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
assert.match(renderToString(createElement(StyledButton, null, 'Save')), /fux-control/);
assert.match(renderToString(createElement(ColorPicker, {label:'Accent',defaultValue:'#225544'})), /Accent/);
assert.ok(DatePicker && Select && Primitives.Table);
assert.deepEqual(validateOutline([{id:'one',text:'One'}]),[]);
assert.equal(typeof Outliner,'function');assert.ok(Button);
try { await import('@samhagman/fast-ux-kit/ark'); throw Error('Ark unexpectedly installed'); }
catch(error) { assert.equal(error.code,'ERR_MODULE_NOT_FOUND'); }
console.log('Core, React reader and RAC entry work with Ark absent.');`,
  );
  console.log(run(process.execPath, ["without-ark.mjs"]).trim());
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "@ark-ui/react@5.39.3",
    "typescript@5.9.3",
    "@types/react@19.2.14",
    "@types/react-dom@19.2.3",
  ]);
  await writeFile(
    join(fixture, "consumer.tsx"),
    `import {createElement, createRef} from 'react';
import {renderToString} from 'react-dom/server';
import {Outliner, OutlineEditor, RichContent, importMarkdownDocument, createReferenceCompletionProvider, createOutlineEditorState, reduceOutlineEditor, createOutlineJSONCodec, encodeOutline, decodeOutline, type OutlineNode, type OutlinePlugin, type OutlineCodec, type OutlineEditorHandle} from '@samhagman/fast-ux-kit';
import {Button, Field, Pagination, ColorPicker, DatePicker, Table, componentManifest} from '@samhagman/fast-ux-kit/components';
import {Pagination as AdvancedPagination} from '@samhagman/fast-ux-kit/ark';
const nodes: readonly OutlineNode[] = [{id:'root',text:'Root',children:[{id:'child',text:'Child'}]}];
const plugin: OutlinePlugin = {id:'consumer-plugin',beforeAction:action=>action,keymap:(event,context)=>event.key==='F2'?{type:'transaction',commands:[{type:'update',id:context.rowId,changes:{text:'Updated by extension'}}]}:undefined};
const codec: OutlineCodec = createOutlineJSONCodec();
if(decodeOutline(encodeOutline(nodes,codec),codec)[0]?.id!=='root') throw Error('Codec roundtrip failed');
const editorRef=createRef<OutlineEditorHandle>();
function publicExtensionAPI() { const source=editorRef.current?.exportWith(codec); if(source) editorRef.current?.importWith(codec,source); }
const provider=createReferenceCompletionProvider({id:'people',trigger:'@',entities:[{id:'person',spelling:'reader'}]});
const document=importMarkdownDocument('# Packed Markdown\\n\\n- [x] Preserved');
let state=createOutlineEditorState(nodes);
state=reduceOutlineEditor(state,{type:'text',id:'root',text:'Updated'}, {readOnly:false});
if(state.nodes[0]?.text!=='Updated') throw Error('Consumer pure editor command failed');
state=reduceOutlineEditor(state,{type:'transaction',commands:[{type:'update',id:'root',changes:{text:'Atomic'}}]}, {readOnly:false});
if(state.nodes[0]?.text!=='Atomic') throw Error('Consumer atomic transaction failed');
const app = <><Outliner nodes={nodes} aria-label="Consumer outline"/><OutlineEditor ref={editorRef} defaultNodes={nodes} readOnly={false} plugins={[plugin]} completionProviders={[provider]}/><RichContent document={document}/><Button variant="primary" onPress={publicExtensionAPI}>Save</Button><Field label="Name"/><Pagination label="Results" count={40}/><ColorPicker label="Accent" defaultValue="#225544"/><DatePicker label="Date"/><Table label="Rows" columns={[{id:'name',label:'Name',render:row=>row.name}]} rows={[{id:'one',name:'One'}]}/></>;
if (!renderToString(app).includes('Consumer outline')) throw Error('SSR failed');
if (!AdvancedPagination.Root) throw Error('Ark export failed');
if (!componentManifest.some(item=>item.name==='ColorPicker')) throw Error('Component catalog incomplete');
console.log('Packed consumer types + SSR pass.');`,
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
    "--outDir",
    "output",
    "consumer.tsx",
  ]);
  console.log(run(process.execPath, ["output/consumer.js"]).trim());
  const deps = JSON.parse(run("npm", ["ls", "react", "react-dom", "--json", "--all"]));
  const versions = new Set();
  const visit = (node) => {
    for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
      if (name === "react" || name === "react-dom") versions.add(`${name}@${dep.version}`);
      visit(dep);
    }
  };
  visit(deps);
  assert.deepEqual([...versions].sort(), ["react-dom@19.2.6", "react@19.2.6"]);
  await writeFile(
    join(fixture, "dedupe.mjs"),
    `import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';import assert from 'node:assert/strict';
const host=createRequire(import.meta.url);
for(const name of ['react','react-dom']){
 const expected=realpathSync(host.resolve(name));
 for(const owner of ['@samhagman/fast-ux-kit','react-aria-components','@ark-ui/react']){
  const scoped=createRequire(import.meta.resolve(owner));
  assert.equal(realpathSync(scoped.resolve(name)),expected,owner+' must resolve host '+name);
 }
}
console.log('Kit/RAC/Ark resolve the same physical React and React DOM files.');`,
  );
  console.log(run(process.execPath, ["dedupe.mjs"]).trim());
  console.log("React/React DOM versions:", [...versions].join(", "));
  console.log(`Tarball allowlist passed (${paths.length} files).`);
} catch (error) {
  if (error.stdout) process.stderr.write(String(error.stdout));
  if (error.stderr) process.stderr.write(String(error.stderr));
  throw error;
} finally {
  await rm(fixture, { recursive: true, force: true });
}
