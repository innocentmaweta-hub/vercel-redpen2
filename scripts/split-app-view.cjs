const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = process.cwd();
const controllerPath = path.join(root, 'src/app/AppControllerCore.tsx');
const viewPath = path.join(root, 'src/app/AppView.tsx');

if (fs.existsSync(viewPath)) process.exit(0);
const source = fs.readFileSync(controllerPath, 'utf8');
const sf = ts.createSourceFile(controllerPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let appFn = null;
function findApp(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'App') { appFn = node; return; } ts.forEachChild(node, findApp); }
findApp(sf);
if (!appFn) throw new Error('Could not find default function App.');
let returnStmt = null;
function findReturn(node) { if (returnStmt) return; if (node !== appFn && ts.isReturnStatement(node)) { returnStmt = node; return; } ts.forEachChild(node, findReturn); }
findReturn(appFn);
if (!returnStmt?.expression) throw new Error('Could not find App return expression.');
const names = new Set();
const globals = new Set(['undefined','NaN','Infinity','Object','Array','String','Number','Boolean','Math','Date','JSON','Promise','Error','RegExp','Set','Map','console','window','document','localStorage','sessionStorage','fetch','setTimeout','clearTimeout','setInterval','clearInterval','encodeURIComponent','decodeURIComponent','parseInt','parseFloat','isNaN','isFinite']);
function propertyName(n) { const p=n.parent; return p && ((ts.isPropertyAccessExpression(p)&&p.name===n)||(ts.isPropertyAssignment(p)&&p.name===n)||(ts.isMethodDeclaration(p)&&p.name===n)||(ts.isPropertySignature(p)&&p.name===n)||(ts.isJsxAttribute(p)&&p.name===n)||(ts.isJsxElement(p)&&(p.openingElement.tagName===n||p.closingElement?.tagName===n))||(ts.isJsxSelfClosingElement(p)&&p.tagName===n)||(ts.isQualifiedName(p)&&p.right===n)); }
function collect(n) { if (ts.isIdentifier(n) && !propertyName(n) && !globals.has(n.text)) { const text=source.slice(n.getStart(sf),n.end); if (text===n.text) names.add(n.text); } ts.forEachChild(n,collect); }
collect(returnStmt.expression);
const props=[...names].sort();
const expression=source.slice(returnStmt.expression.getStart(sf),returnStmt.expression.end);
fs.writeFileSync(viewPath, `/** Mechanical extraction of the existing App render tree. */\nexport function AppView(props: Record<string, any>) {\n  const { ${props.join(', ')} } = props;\n  return ${expression};\n}\n`);
const importText="import { AppView } from './AppView';\n";
const firstImport=source.indexOf('import ');
const withImport=firstImport>=0?source.slice(0,firstImport)+importText+source.slice(firstImport):importText+source;
const start=returnStmt.getStart(sf)+importText.length;
const end=returnStmt.end+importText.length;
const replacement=`return <AppView {...{${props.join(',')}}} />;`;
fs.writeFileSync(controllerPath, withImport.slice(0,start)+replacement+withImport.slice(end));
console.log(`Extracted AppView with ${props.length} bindings.`);
