import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from 'file:///C:/Users/saujh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const W=1280,H=720;
const C={bg:'#170F24',panel:'#241832',panel2:'#30203F',ink:'#FFF8F3',muted:'#C9B8D1',pink:'#FF5C8A',mint:'#83E6C1',gold:'#FFC66D',line:'#4A3657'};
const pres=Presentation.create({slideSize:{width:W,height:H}});
function shape(slide,geom,x,y,w,h,fill,line='none',lw=0){return slide.shapes.add({geometry:geom,position:{left:x,top:y,width:w,height:h},fill,line:{style:'solid',fill:line,width:lw}})}
function txt(slide,text,x,y,w,h,size,color=C.ink,bold=false){const s=shape(slide,'textbox',x,y,w,h,'none');s.text=text;s.text.style={fontFamily:'Arial',fontSize:size,color,bold,verticalAlignment:'middle',wrap:true};return s;}
function base(title,kicker='SPLIT UP • PRODUCT OVERVIEW',num){const s=pres.slides.add();s.background.fill=C.bg;shape(s,'ellipse',1000,0,280,220,'#251632');shape(s,'ellipse',1100,550,180,170,'#20132D');txt(s,kicker,68,40,700,24,14,C.mint,true);txt(s,title,68,76,1110,70,38,C.ink,true);shape(s,'rect',68,155,72,5,C.pink);txt(s,'Friends. Expenses. No drama.',68,674,500,20,13,C.muted);txt(s,String(num).padStart(2,'0'),1170,674,42,20,13,C.muted,true);return s;}
function card(s,x,y,w,h,title,body,accent=C.pink){shape(s,'roundRect',x,y,w,h,C.panel,C.line,1);shape(s,'roundRect',x,y,7,h,accent);txt(s,title,x+24,y+20,w-48,36,21,C.ink,true);txt(s,body,x+24,y+63,w-48,h-76,16,C.muted);}
function bullets(s,items,x,y,w,step=50){items.forEach((v,i)=>{shape(s,'ellipse',x,y+i*step+8,10,10,i%2?C.mint:C.pink);txt(s,v,x+22,y+i*step,w-22,38,18,C.ink);});}
// Cover
{
 const s=pres.slides.add();s.background.fill=C.bg;shape(s,'ellipse',760,0,520,500,'#2B1839');shape(s,'ellipse',850,400,430,320,'#241431');
 txt(s,'SPLIT UP',76,66,470,30,16,C.mint,true);txt(s,'Shared plans.\nClear balances.',76,170,650,180,54,C.ink,true);txt(s,'A group expense app that brings spending, decisions and settling up into one place.',82,378,540,90,22,C.muted);
 shape(s,'roundRect',790,166,370,356,C.panel,C.line,1);txt(s,'GOA WEEKEND',824,196,300,28,14,C.mint,true);txt(s,'₹ 4,860',824,240,300,58,40,C.ink,true);txt(s,'group expenses tracked',824,300,300,28,16,C.muted);
 shape(s,'roundRect',824,358,300,1,C.line);txt(s,'Maya  →  Arjun',824,382,280,32,18,C.ink,true);txt(s,'₹ 1,240 to settle',824,417,280,26,16,C.pink,true);txt(s,'Friends. Expenses. No drama.',82,648,430,24,15,C.muted);
}
// 2 problem / promise
{
 const s=base('Group spending gets messy fast','THE PROBLEM • THE PROMISE',2);
 txt(s,'Plans are shared. Payments are scattered.',68,192,570,50,26,C.ink,true);bullets(s,['One person pays now; everyone forgets later.','Uneven splits turn a simple bill into a debate.','The group still needs to agree on what happens next.'],68,272,555,58);
 shape(s,'roundRect',700,205,500,350,C.panel,C.line,1);txt(s,'SPLIT UP BRINGS IT TOGETHER',736,240,420,28,14,C.mint,true);txt(s,'Track the cost.\nMake the call.\nClose the balance.',736,292,420,170,36,C.ink,true);txt(s,'One shared space for the group’s money moments.',736,480,420,46,17,C.muted);
}
// 3 expense tracking
{
 const s=base('Flexible expense tracking','01 • SPEND TOGETHER',3);
 card(s,68,198,345,190,'Log shared costs','Add a description, amount, date and category to a group expense.',C.pink);
 card(s,444,198,345,190,'Choose a fair split','Split equally, by percentage, exact amount or shares.',C.mint);
 card(s,820,198,380,190,'Keep the record clear','View group expenses and balances in one shared place.',C.gold);
 txt(s,'The payer and the split are recorded together, so the group can see who covered what.',68,444,1050,68,24,C.ink,true);
 txt(s,'Supported split methods: equal • percent • exact • shares',68,542,1000,32,16,C.muted);
}
// 4 groups
{
 const s=base('Groups make every plan easier to manage','02 • ORGANIZE THE PEOPLE',4);
 txt(s,'A group is the home for its members, expenses, polls and savings goal.',68,190,630,62,23,C.ink,true);
 bullets(s,['Create a group or join with an invite code or link.','Add members and keep shared activity together.','See who owes whom and what expenses are still open.'],68,284,620,58);
 shape(s,'roundRect',760,206,440,342,C.panel,C.line,1);txt(s,'ONE GROUP • MANY MOMENTS',795,236,370,24,14,C.mint,true);
 [['01','Plan the trip'],['02','Record each spend'],['03','Vote on choices'],['04','Settle together']].forEach((a,i)=>{const yy=284+i*58;shape(s,'ellipse',796,yy+3,34,34,i===3?C.pink:C.panel2);txt(s,a[0],796,yy+3,34,34,12,C.ink,true);txt(s,a[1],846,yy,300,38,19,C.ink,true);if(i<3)shape(s,'rect',812,yy+39,2,19,C.line);});
}
// 5 settle
{
 const s=base('Make settling up visible and simple','03 • CLOSE THE LOOP',5);
 shape(s,'roundRect',68,202,500,360,C.panel,C.line,1);txt(s,'GROUP BALANCE',102,232,400,26,14,C.mint,true);txt(s,'Who owes what',102,272,400,42,27,C.ink,true);
 [['Maya → Arjun','₹1,240'],['Dev → Maya','₹680'],['Arjun → Dev','₹320']].forEach((a,i)=>{const yy=342+i*63;shape(s,'rect',102,yy+45,420,1,C.line);txt(s,a[0],102,yy,300,34,18,C.ink);txt(s,a[1],410,yy,110,34,18,i===0?C.pink:C.ink,true);});
 txt(s,'Mark a payment as settled, add a note and track streaks as the group clears balances.',630,228,530,126,27,C.ink,true);
 card(s,630,398,530,150,'Share a settle-up card','Download a PNG story summary with the group name and balances.',C.pink);
}
// 6 polls savings
{
 const s=base('Decide together. Save toward the next plan.','04 • GROUP COORDINATION',6);
 card(s,68,204,520,328,'Group polls','Ask a question, add options and set a deadline. Members vote once; results update in real time.',C.mint);
 card(s,636,204,564,328,'Shared savings goals','Name a goal, set a target and let members chip in with an optional note.',C.gold);
 txt(s,'From “Where should we go?” to “How much do we need?”, the group can plan in the same place it tracks spending.',68,566,1090,62,22,C.ink,true);
}
// 7 quick capture
{
 const s=base('Capture expenses the way that suits you','05 • QUICK INPUT',7);
 card(s,68,210,335,268,'Voice input','Use speech recognition for group names, expense descriptions and poll questions.',C.pink);
 card(s,444,210,335,268,'Receipt item splitter','Assign receipt items to the people who ordered them, then apply the split to an expense.',C.mint);
 card(s,820,210,380,268,'Demo mode','Try the app instantly with local browser storage; a backend is not required for the demo.',C.gold);
 txt(s,'Voice recognition depends on browser support; unsupported browsers show a simulated example.',68,542,1080,32,15,C.muted);
}
// 8 tech
{
 const s=base('A full stack foundation for shared activity','06 • HOW IT WORKS',8);
 const cols=[['FRONT END','Vanilla HTML, CSS and JavaScript'],['API','Node.js + Express'],['DATA','MongoDB + Mongoose'],['LIVE UPDATES','Socket.IO']];
 cols.forEach((a,i)=>{const x=68+i*286;txt(s,a[0],x,216,248,24,13,[C.mint,C.pink,C.gold,C.mint][i],true);txt(s,a[1],x,252,248,88,23,C.ink,true);if(i<3){shape(s,'rect',x+252,287,22,2,C.line);}});
 shape(s,'roundRect',68,390,1130,176,C.panel,C.line,1);txt(s,'BUILT-IN SAFEGUARDS',100,418,350,24,14,C.mint,true);
 bullets(s,['Passwords hashed with bcrypt; protected API routes use JWT.','Rate limits, security headers and group membership checks protect key actions.','Creators control expense and poll edits; users can vote only once.'],100,458,1040,36);
}
// 9 close
{
 const s=pres.slides.add();s.background.fill=C.bg;shape(s,'ellipse',790,0,490,500,'#2B1839');txt(s,'SPLIT UP',76,70,400,28,15,C.mint,true);txt(s,'Make the plan.\nShare the cost.\nSettle with clarity.',76,166,720,260,48,C.ink,true);txt(s,'Groups • flexible splits • polls • savings goals • voice input • real-time updates',82,470,800,58,20,C.muted);shape(s,'roundRect',960,254,210,210,C.pink);txt(s,'÷',960,254,210,210,88,C.bg,true);txt(s,'Friends. Expenses. No drama.',82,640,440,24,15,C.muted);
}

const outDir=path.resolve('output');await fs.mkdir(outDir,{recursive:true});
for(let i=0;i<pres.slides.items.length;i++){const blob=await pres.export({slide:pres.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(outDir,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));}
const draft=path.resolve('.build','draft.pptx');await fs.mkdir(path.dirname(draft),{recursive:true});await (await PresentationFile.exportPptx(pres)).save(draft);
console.log(JSON.stringify({slides:pres.slides.items.length,draft,outDir}));
