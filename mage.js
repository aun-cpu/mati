/* mage.js — 魔法人（魔法人・調査員・軍人の体・戦い方・出し方）のコード（index.html から分離）。
   index.html の、メインの <script> のあとの <script src="mage.js"> で読み込まれる（gatekeeper.js より前）。
   ゲートキーパーも同じ体（makeMage・spawnMage）を使うので、gatekeeper.js を使う時は、このファイルも必要。
   このファイルが無くても index.html だけで動く（魔法人・調査員・軍人・ゲートキーパーが出ないだけ）。
   モジュールではなく普通のスクリプトなので、index.html 側の関数・定数・変数はそのまま使えて、index.html からもここの関数をそのまま呼べる。
   中のコードは index.html から切り出したままで、動きは変えていない。順番も元のまま。
   含むもの:
     1. 基本の数値（MAGE / INSP_ELEM / MINSP / MSOLD）
     2. 手の形・質感（mageHandGeos / MLOOK / mageLookMat / mageJit）と、3Dモデル makeMage
     3. 戦い方: 結界・隙・崩れ（MGD / mageGuard / mageBreak / mageBar*）、剣での弾き（swordDeflect）、下がる（mageBack）
     4. 出し方・動き: spawnMage / mageDeadStep / mageStep
     5. 相殺（mageCounter）
   ※ 軍人の剣・槍などの戦い方の仕組み（SSW など）は index.html に残してある。 */

// ---------- 魔法人: 長いローブと長い袖、胴から離れて浮く菱形の頭。物理100・魔力100〜150（敵の魔法は 魔力÷100 倍の出力なので、100以上なら全力）。プレイヤーに気づくと、両手の間に光を集めて火・雷・氷のどれかを撃つ（光る色で種類がわかる・光った瞬間が相殺のタイミング）。倒すと後ろか前へ倒れ、しばらくしてから薄れて消える。魔力があるので魔法が効く。魔法石を稀に落とす ----------
const MAGE={W:.72,H:1.75,SIGHT:30,WALK:.7,CHASE:2.4,RANGE:10,WAIT:[2.2,1.8],HP:[300,400],LIE:4,FADE:2,DUST:[0x5a4aa0,0x7a6ad0,0x3a2f70],COL:{robe:0x3b3b42,sleeve:0x45454c,mantle:0x2e2e34,panel:0x56565c,sash:0x5c4f48,trim:0x8a8168,skin:0xc9b6a0,head:0xd8d1bd,eye:0x8fe8ff}};   // SIGHT=気づく距離(m) / WALK・CHASE=歩く・近づく速さ(m/秒) / RANGE=この距離より近ければ魔法を撃つ（遠ければ近づく） / WAIT=次に撃つまでの間(最小,ばらつき秒) / LIE=倒れてから薄れ始めるまで(秒) / FADE=薄れる秒数
const INSP_ELEM=['ice','fire','thunder','water'];   // 調査員の腕ごとの魔法（腕の順: 画面の左上・右上・左下・右下で見た時の 氷・火・雷・水）。撃つたびに4本のうち1本がランダムに選ばれ、その手だけが魔法を撃つ
const MINSP={COL:{robe:0x3f3b36,sleeve:0x48443e,mantle:0x33302c,panel:0x1f1e21,trim:0x9c8650,sash:0x2c2a2d,hat:0x2a2a2f,band:0x6a5a40}};   // 調査員の色（魔法人の色に上書き）: トレンチコート風の暗い褐色・真鍮のボタン・黒い帽子
const MSOLD={COL:{robe:0x474a3a,sleeve:0x4d5040,mantle:0x6e7175,panel:0x5e5b49,trim:0x9c8650,sash:0x5c3a2e,stripe:0x2b2b25,armor:0x8a8d91}};   // 軍人の色（魔法人の色に上書き）: 地味なオリーブ褐色の軍服・くすんだ真鍮・暗い赤茶の結び帯
let mageHandCache=null;
function mageHandGeos(){                                             // 魔法人の手: 人間ベース(HUMAN_B64)の左手・右手の形をそのまま取り出す（手首が原点・指先は-Y・指は少し前(+Z)へ曲がる。元の高さ2の大きさ）。取り出せなかった時は null
  if(mageHandCache!==null)return mageHandCache;
  mageHandCache=false;
  try{
    const bin=atob(window.HUMAN_B64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    const{geo,skin}=parseGLB(u8.buffer),P=geo.attributes.position,N=geo.attributes.normal,ix=geo.index.array,res={};
    for(const side of['Left','Right']){
      const ji=skin.names.findIndex(n=>n.endsWith(':'+side+'Hand'));if(ji<0)return mageHandCache;
      const inH=v=>{let w=0;for(let k=0;k<4;k++)if(skin.joints[v*4+k]===ji)w+=skin.weights[v*4+k];return w>.5};
      const map=new Map(),pos=[],nor=[],idx=[];let top=-1e9,sx=0,sz=0,sn=0;
      for(let t=0;t<ix.length;t+=3){const a=ix[t],b=ix[t+1],c=ix[t+2];if(!(inH(a)&&inH(b)&&inH(c)))continue;
        for(const v of[a,b,c]){if(!map.has(v)){map.set(v,pos.length/3);pos.push(P.getX(v),P.getY(v),P.getZ(v));nor.push(N.getX(v),N.getY(v),N.getZ(v));top=Math.max(top,P.getY(v))}idx.push(map.get(v))}}
      if(!idx.length)return mageHandCache;
      for(let i=0;i<pos.length;i+=3)if(pos[i+1]>top-.04){sx+=pos[i];sz+=pos[i+2];sn++}
      const cx=sx/sn,cz=sz/sn;for(let i=0;i<pos.length;i+=3){pos[i]-=cx;pos[i+1]-=top;pos[i+2]-=cz}   // 手首（手の上の端の真ん中）を原点にする
      {let ty=0,tz=0,tn=0;const ys=[];for(let i=1;i<pos.length;i+=3)ys.push(pos[i]);ys.sort((a,b)=>a-b);const lim=ys[Math.floor(ys.length*.12)];   // 元の手は前腕の傾きのまま少し後ろへ傾いているので、指先が真下に来るよう回し、さらに指先を少し前へ曲げる
        for(let i=0;i<pos.length;i+=3)if(pos[i+1]<=lim){ty+=pos[i+1];tz+=pos[i+2];tn++}
        const th=Math.atan(-(tz/tn)/(ty/tn))-.2,cs=Math.cos(th),sn2=Math.sin(th);
        for(let i=0;i<pos.length;i+=3){const y=pos[i+1],z=pos[i+2];pos[i+1]=y*cs-z*sn2;pos[i+2]=y*sn2+z*cs;const ny=nor[i+1],nz=nor[i+2];nor[i+1]=ny*cs-nz*sn2;nor[i+2]=ny*sn2+nz*cs}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(pos),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(nor),3));g.setIndex(idx);
      res[side]=g;
    }
    mageHandCache=res;
  }catch(e){console.warn('魔法人の手を人間ベースから取り出せませんでした',e);mageHandCache=false}
  return mageHandCache;
}
// ---------- 魔法人系（魔法人・調査員・軍人・ゲートキーパー）の質感: 人間・ゾンビの「粗くて暗いPS1風」にそろえる ----------
// 以前は「色がつるんと均一で形も整いすぎた、粘土のおもちゃ」のように見えて周りから浮いていた。そこで
//  (1)つやを消す (2)体の表面に粗い粒(ざらつき)と汚れのまだらを付ける (3)色の段数を減らして少し暗く・くすませる (4)形を手作りっぽく少しゆがめる
// ON=false にすると元の見た目に戻る（比較用）。数字を変えれば強さを調整できる。
const MLOOK={ON:true,
  TEXEL:14,      // 粒の細かさ（1mあたりの粒の数。大きいほど細かい。描画が低解像度(PIXH)なので 10〜18 くらいが「ドット」に見える）
  GRAIN:.13,     // 粒の明暗のふり幅（0〜.3）。近くでだけ見え、遠いと自然に消える
  BLOT:5,        // 汚れのまだらの大きさ（1mあたりの数。小さいほど大きな染み）
  BLOTCH:.26,    // 汚れで暗くなる強さ（0〜.5）
  DARK:.88,      // 全体の明るさの倍率
  DESAT:.16,     // 色のくすませ（0=そのまま / 1=灰色）
  LEVELS:28,     // 色の段数（小さいほど段々になる。ふつうの絵は256）
  JIT:.02};      // 形のゆがみ（m。0でゆがめない）
function mageLookMat(mat){                                          // 魔法人の材質に、粗い粒・汚れ・色数減らし・くすみを足す（光の当たり方は元のまま）。粒は体に固定（動いても流れない）
  if(!MLOOK.ON)return;
  const f=v=>Number(v).toFixed(3);
  mat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMP;varying float vMD;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMP=position;vMD=length((modelViewMatrix*vec4(position,1.0)).xyz);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMP;varying float vMD;\nfloat mlHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}')
      .replace('#include <color_fragment>',`#include <color_fragment>
{float mlFg=1.0-smoothstep(10.0,26.0,vMD),mlFb=1.0-smoothstep(24.0,48.0,vMD);
float mlG=mlHash(floor(vMP*${f(MLOOK.TEXEL)})),mlB=mlHash(floor(vMP*${f(MLOOK.BLOT)})+17.0);
vec3 mlC=diffuseColor.rgb*(1.0+(mlG-.5)*2.0*${f(MLOOK.GRAIN)}*mlFg)*(1.0-step(.7,mlB)*${f(MLOOK.BLOTCH)}*mlFb);
float mlL=dot(mlC,vec3(.299,.587,.114));
mlC=mix(vec3(mlL),mlC,1.0-${f(MLOOK.DESAT)})*${f(MLOOK.DARK)};
diffuseColor.rgb=floor(mlC*${f(MLOOK.LEVELS)}+.5)/${f(MLOOK.LEVELS)};}`);
  };
  mat.customProgramCacheKey=()=>'mageLook';
}
function mageJf(x,y,z){const A=MLOOK.ON?MLOOK.JIT:0;if(!A)return[0,0,0];   // 位置だけで決まるなめらかなゆがみ（近くの面どうしは同じ向きにずれるので、飾りが体にめり込んだり浮いたりしない）
  return[A*(Math.sin(x*21.7+y*13.1+z*7.3)*.55+Math.sin(z*33.1-y*17.9+x*5.7)*.45),A*(Math.sin(y*23.3+z*11.7+x*9.1+2.1)*.55+Math.sin(x*29.9-z*15.3+y*6.1)*.45),A*(Math.sin(z*19.9+x*14.3+y*8.7+4.2)*.55+Math.sin(y*31.7-x*12.1+z*5.3)*.45)]}
function mageJit(geo,ox,oy,oz){if(!(MLOOK.ON&&MLOOK.JIT))return;      // 部品の頂点を少しずらして、数式で作ったような整いすぎた形をくずす（ox,oy,oz=部品を置く位置）
  const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),d=mageJf(x+ox,y+oy,z+oz);p.setXYZ(i,x+d[0],y+d[1],z+d[2])}
  geo.computeVertexNormals()}
function makeMage(hs,variant,hatless,headShape,legs,flat){                                                // 魔法人の3Dモデル（足もとが原点・正面+Z）。ローブ（ひだ・前の飾り帯・すその縁どり）・肩掛け・立ちえり・帯と垂れ・広がる長い袖。手は人間ベースの手の形。頭は胴から離れて浮く菱形。色は頂点ごとに塗る（材質は1つ。殴られた時の赤い点滅・薄れは mat の色と透明度で全体にかかる）。W=細さ（小さいほど細い）/ H=高さの倍率
  const insp=variant===true||variant==='inspector',sold=variant==='soldier',geos=[],parts=[],C=insp?Object.assign({},MAGE.COL,MINSP.COL):sold?Object.assign({},MAGE.COL,MSOLD.COL):Object.assign({},MAGE.COL),W=MAGE.W*(sold?1.3:1),H=MAGE.H;   // 軍人は体の横幅が魔法人より大きい(1.3倍)。variant: 'inspector'(調査員) / 'soldier'(軍人) / それ以外=魔法人
  const fr=typeof legs==='string'?(legs==='robe'?null:legs):null;legs=!!legs;   // fr=ゲートキーパーの体格（頭以外）: null=①脚がマント（ローブ） / 'lanky'=②手足が長く、やや前屈みでやや膝を曲げる / 'bulky'=③上半身が太く、くびれと脚があり、膝を曲げて前屈み
  if(flat&&fr==='bulky')flat=Object.assign({},flat,{DEPTH:1,DEPTH_SOLDIER:1,SHOULDER:1,SHOULDER_SOLDIER:1});   // 太い体は、前後を薄くしない
  else if(flat&&fr==='lanky')flat=Object.assign({},flat,{DEPTH:1,DEPTH_SOLDIER:1,SHOULDER:1,SHOULDER_SOLDIER:1});
  const LK=fr==='lanky'?1.75:fr==='bulky'?1.12:1,AL=fr==='lanky'?1.95:fr==='bulky'?1.35:1,AT=fr==='lanky'?1.7:fr==='bulky'?1:1,LT=fr==='lanky'?.9:fr==='bulky'?1.35:1,TS=fr==='lanky'?.8:fr==='bulky'?1.5:1,MK=fr==='lanky'?.7:fr==='bulky'?1.15:1;   // LK=脚の長さ / AL=腕の長さ / AT=腕の太さ / LT=脚の太さ / TS=胴の太さ（軍人の胴・装飾の寸法合わせ） / MK=肩掛けの大きさ（すべてふつう=1）
  const POSE=fr==='lanky'?{lean:.1,hip:-.2,knee:.28}:fr==='bulky'?{lean:.4,hip:-.45,knee:.35,splay:.32}:null;   // 立ち姿の基本ポーズ: lean=前屈み(rad) / hip=太ももを前へ / knee=膝を曲げる。歩く動きは mageStep がこの上に足す
  const GT=fr==='lanky'?{sw:.42,kn:.75,out:.02,toe:0,cad:.6,bob:.03,roll:.05,arm:.26,lx:1.4,lag:.7,twist:.1,nod:.02}:fr==='bulky'?{sw:.5,kn:.5,out:.32,toe:.05,cad:.8,bob:.07,roll:.14,arm:.4,lx:1.8,kz:1,lag:.5,twist:.16,nod:.06}:null;   // 歩き方（体格ごと）: sw=足を振る大きさ / kn=膝を曲げる大きさ / out=足を横に開く角度（常に） / toe=つま先を外へ / cad=足を動かす速さ（小さいほどゆっくり大股） / bob=歩く時の上下 / roll=歩く時の体の左右の傾き（太い体はのしのし揺れる） / arm=腕の振り / lx=足の付け根の間隔の倍率（lanky=足が近い / bulky=広い）
  const Lt0=1.27*H*LK,tl0=.52*Lt0,ank0=Lt0-tl0-.1,poseDy=POSE?(.95*H*(1-Math.cos(POSE.lean))-(tl0+ank0)+tl0*Math.cos(POSE.lean+POSE.hip)+ank0*Math.cos(POSE.lean+POSE.hip+POSE.knee)-(POSE.splay?tl0*(1-Math.cos(POSE.splay)):0)):0;   // 膝を曲げて前屈みになった分だけ体を下げて、足が地面につくようにする
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide,flatShading:true});mageLookMat(mat);   // ローポリ: 面ごとに陰影をつけて角ばらせる（つやなし＋粗い粒・汚れ・くすみ。mageLookMat）
  const DZ=flat?(sold?flat.DEPTH_SOLDIER:flat.DEPTH):1,SHW=flat?(sold?flat.SHOULDER_SOLDIER:flat.SHOULDER):1,   // 人型の体型（ゲートキーパーだけ。flat=GKA.SHAPE）: DZ=胴の前後の厚みの倍率 / SHW=肩まわりの横幅の倍率
    shBump=y=>{const t=(y/H-1.4)/.22;return Math.abs(t)<1?1+(SHW-1)*.5*(1+Math.cos(Math.PI*t)):1};   // 肩の高さ(1.4H)を中心に、上下に滑らかに減る横幅の倍率
  const part=(parent,geo,col,x,y,z)=>{if(parent===body&&(DZ!==1||SHW!==1)){const q0=geo.attributes.position;for(let i=0;i<q0.count;i++){q0.setX(i,q0.getX(i)*shBump(q0.getY(i)+y));q0.setZ(i,q0.getZ(i)*DZ)}geo.computeVertexNormals();z*=DZ}   // 胴の丸い輪切りを、横に広く前後に薄い楕円にする
    mageJit(geo,x,y,z);   // 形を手作りっぽく少しゆがめる
    const p=geo.attributes.position,n=p.count,ca=new Float32Array(n*3),k=new THREE.Color();   // col=色(16進)か、(Color,x,y,z)で色を決める関数
    for(let i=0;i<n;i++){if(typeof col==='function')col(k,p.getX(i),p.getY(i),p.getZ(i));else k.set(col);ca[i*3]=k.r;ca[i*3+1]=k.g;ca[i*3+2]=k.b}
    geo.setAttribute('color',new THREE.BufferAttribute(ca,3));geos.push(geo);parts.push({geo,col});   // 色の指定を覚えておく（あとで recolor で塗り直せる）
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
  const shade=(k,hex,b)=>k.set(hex).multiplyScalar(b);
  const foldK=(th,y)=>{const f=Math.max(0,Math.min(1,(1.15*H-y)/(1.15*H)));return 1+.04*f*Math.sin(th*10)+.015*f*Math.sin(th*23+1)};   // ローブのひだ: すそに近いほど深い
  const fold=(geo,yOff)=>{const q=geo.attributes.position;for(let i=0;i<q.count;i++){const x=q.getX(i),y=q.getY(i),z=q.getZ(i),k=foldK(Math.atan2(x,z),y+yOff);q.setXYZ(i,x*k,y,z*k)}geo.computeVertexNormals();return geo};
  const g=new THREE.Group(),body=new THREE.Group();body.position.y=legs?.02+(.32+1.27*(LK-1))*H+poseDy:.12;g.add(body);   // 足があるタイプは、上半身を .32H 持ち上げて足を長くする（地面は body 座標で y=-.32H）
  g.scale.setScalar(hs);   // 地面から少し浮いて、すべるように動く
  const PROF=fr==='bulky'?[[.54,0],[.5,.12],[.42,.4],[.34,.7],[.3,.95],[.34,1.1],[.5,1.25],[.66,1.4],[.7,1.5],[.62,1.6],[.3,1.67],[.09,1.67],[.001,1.7]]:fr==='lanky'?[[.54,0],[.5,.12],[.42,.4],[.34,.7],[.2,.95],[.22,1.0],[.2,1.12],[.24,1.3],[.3,1.44],[.26,1.52],[.12,1.6],[.07,1.66],[.001,1.7]]:[[.54,0],[.5,.12],[.42,.4],[.34,.7],[.3,.95],[.32,1.15],[.34,1.36],[.31,1.5],[.22,1.58],[.12,1.63],[.001,1.64]];   // 胴の輪郭（半径,高さ。W・H単位）: bulky=腰が細く胸が太い樽型 / lanky=細くて長い胴
  const prof=PROF.map(p=>[p[0]*W,p[1]*H]);
  const rAt=y=>{for(let i=0;i<prof.length-1;i++){const A=prof[i],B=prof[i+1];if(y>=A[1]&&y<=B[1])return A[0]+(B[0]-A[0])*(y-A[1])/(B[1]-A[1])}return prof[prof.length-1][0]};
  const V2=a=>a.map(p=>new THREE.Vector2(p[0],p[1]));
  const yc=legs?.95*H:0,lw=p=>!legs||p[1]>yc;   // legs=足があるタイプ: ローブ（スカート）は腰の高さ(.95H)までで切り、その下は足にする
  if(!fr)part(body,fold(new THREE.LatheGeometry(V2((legs?[[.001,yc],[rAt(yc)*1.12,yc]]:[[.001,0]]).concat(sold?prof.filter(p=>p[1]<.99*H&&lw(p)).concat([[rAt(1.0*H),1.0*H],[rAt(1.0*H)*.94,1.03*H],[.001,1.03*H]]):prof.filter(lw))),8),0),(k,x,y,z)=>{const th=Math.atan2(x,z),yn=y/(1.64*H);shade(k,C.robe,.7+.35*yn+.08*Math.sin(th*10)*(1-yn))},0,0,0);   // 長いローブ（ひだ・すそほど暗い）
  if(fr){   // ===== 体格（頭以外）をローブではなく人の形で作る: 胴(樽型/細長)・骨盤・猫背のこぶ。腕と脚は下の腕・脚の組み立てで、体格ごとの形になる =====
    const bk=fr==='bulky',tpts=[[.001,.95*H]].concat(PROF.filter(p=>p[1]>=.95&&(!sold||p[1]<=.99)).map(p=>[p[0]*W,p[1]*H]));
    if(sold)tpts.push([.001,.99*H]);
    const tg=new THREE.LatheGeometry(V2(tpts),8),tq=tg.attributes.position;for(let i=0;i<tq.count;i++)tq.setZ(i,tq.getZ(i)*(bk?.85:.72));tg.computeVertexNormals();   // 前後は左右より薄い（胴の断面は楕円）
    part(body,tg,(k,x,y,z)=>shade(k,C.robe,.72+.3*(y-.95*H)/(.75*H)),0,0,0);
    const pv=part(body,new THREE.SphereGeometry((bk?.3:.2)*W,6,3),C.robe,0,.97*H,0);pv.scale.set(1,.7,.85);   // 骨盤
    if(bk&&!sold){const hb=part(body,new THREE.SphereGeometry(.5*W,6,3),(k,x,y,z)=>shade(k,C.robe,.8+.25*Math.max(0,y/(.5*W))),0,1.42*H,-.16*W);hb.scale.set(1.2,.9,1)}   // 背中のこぶ（前屈みの猫背）
    if(!sold){
      if(bk){}   // 太い体は、胴の輪郭（PROF）と背中のこぶだけで、なめらかな1つの塊にする
      else{   // 細長い体のディテール: あばら・背骨のこぶ・鎖骨
        for(let i=0;i<4;i++){const yy=(1.18+i*.07)*H,t=new THREE.TorusGeometry(rAt(yy)*1.02,.011,5,8);t.rotateX(Math.PI/2);const rb=part(body,t,(k)=>shade(k,C.robe,.5),0,yy,0);rb.scale.z=.72}
        for(let i=0;i<7;i++){const yy=(1.0+i*.1)*H;part(body,new THREE.SphereGeometry(.032,6,3),0xb9ad92,0,yy,-rAt(yy)*.72-.004)}
        const cb=new THREE.CylinderGeometry(.028*W,.028*W,2*(rAt(1.48*H)+.1*W),6);cb.rotateZ(Math.PI/2);part(body,cb,0xb9ad92,0,1.5*H,.05*W)}}
  }
  const pn=prof.filter(p=>p[1]<=1.5*H&&(!legs||p[1]>=yc)).map(p=>[p[0]*1.025+.004,p[1]]);   // 前の飾り帯（正面の細い帯。縁は金）
  if(!insp&&!sold&&!fr)part(body,fold(new THREE.LatheGeometry(V2(pn),8,-.2,.4),0),(k,x,y,z)=>{const e=Math.abs(Math.atan2(x,z));if(e>.17)k.set(C.trim);else shade(k,C.panel,.85+.2*y/(1.5*H))},0,0,0);
  if(sold){
    const yT0=.98*H,yT1=1.6*H,bx=.32*W*TS,bz=.29*W*TS,tx=.55*W*TS,tz=.34*W*TS;   // 角張った鎧の胴: 六角柱（前と後ろに稜線）。腰が細く肩が広い
    const torso=(y0,y1,sc,open)=>{const g0=new THREE.CylinderGeometry(1,1,1,6,8,!!open).toNonIndexed(),q=g0.attributes.position;   // 面ごとに平らに陰影をつけて角張らせる
      for(let i=0;i<q.count;i++){const yy=y0+(y1-y0)*(q.getY(i)+.5),u=(yy-yT0)/(yT1-yT0),zz=q.getZ(i),bu=Math.max(0,1-Math.pow((yy-1.33*H)/(.3*H),2));   // bu=胸の高さで最大(0〜1)
        q.setXYZ(i,q.getX(i)*(bx+(tx-bx)*u)*sc,yy,zz*(bz+(tz-bz)*u)*sc+Math.max(0,zz)*bu*.1*sc)}   // 前側だけ胸の高さでふくらむ（横から見ると胸が少し飛び出る）
      g0.computeVertexNormals();return g0};
    part(body,torso(yT0,yT1,1,false),(k,x,y)=>shade(k,C.armor,.7+.4*(y-yT0)/(yT1-yT0)),0,0,0);   // 鎧の胴
    const ty=(legs?[.98,.88,.78]:[.98,.88,.78,.68,.58,.48]).map(v=>v*H),tp=ty.map(y=>[legs?Math.max(rAt(y)*1.035+.012,.36*W):rAt(y)*1.035+.012,y]);   // 草摺（腰の両脇に垂れる板）: 帯から下へ、前の中央をあけて左右に1枚ずつ
    for(const s of[-1,1]){const a=s>0?.28:-.9,b=a+.62;
      part(body,fold(new THREE.LatheGeometry(V2(tp),8,a,.62),0),(k,x,y,z)=>shade(k,C.panel,.8+.3*y/H),0,0,0);
      for(const yy of legs?[.9,.8,.7]:[.9,.8,.7,.6,.49]){const rr=legs?Math.max(rAt(yy*H)*1.035+.016,.36*W+.004):rAt(yy*H)*1.035+.016,tg=new THREE.TorusGeometry(rr,yy<.5?.013:.008,4,10,.62);tg.rotateX(Math.PI/2);tg.rotateY(b-Math.PI/2);part(body,fold(tg,yy*H),C.stripe,0,yy*H,0)}}   // 板の横線（いちばん下は太い縁）
  }
  if(insp&&!fr){part(body,fold(new THREE.LatheGeometry(V2(pn),4,-.035,.07),0),(k,x,y,z)=>shade(k,C.panel,.9+.2*y/(1.5*H)),0,0,0);   // 前の合わせ目（縦の暗い線）
    for(let i=legs?5:0;i<8;i++){const by2=H*(.3+i*.155),br2=rAt(by2)*1.035;part(body,new THREE.BoxGeometry(.11,.024,.024),C.trim,0,by2,br2+.006)}}   // 留め具（横棒のボタンが縦に並ぶ）
  if(!fr)for(const[yy,rw,tb]of legs?[[.95*H,1.12,.022]]:[[.04,1,.022],[.2*H,1.0,.012]]){const t=new THREE.TorusGeometry(rAt(yy)*rw,tb,6,8);t.rotateX(Math.PI/2);part(body,fold(t,yy),C.trim,0,yy,0)}   // すその金の縁どり（ひだに沿う）
  const mant=[[.5,1.28],[.47,1.38],[.4,1.48],[.3,1.56],[.22,1.6]].map(p=>[p[0]*W*MK,p[1]*H]);   // 肩掛け（短いマント）: 肩から腕のつけ根をおおう
  if(!sold&&!fr){part(body,new THREE.LatheGeometry(V2(mant),8),(k,x,y,z)=>shade(k,C.mantle,.8+.3*(y-1.28*H)/(.32*H)),0,0,0);
  const mt=new THREE.TorusGeometry(.5*W*MK,.022,6,8);mt.rotateX(Math.PI/2);part(body,mt,C.trim,0,1.28*H,0)}   // 肩掛けの縁どり（軍人には付けない）
  const collar=new THREE.LatheGeometry(V2(sold?[[.25*W,1.55*H],[.22*W,1.6*H],[.22*W,1.72*H]]:[[.19*W,1.57*H],[.2*W,1.63*H],[.25*W,1.69*H]]),8);if(!fr)part(body,collar,C.mantle,0,0,0);   // 立ちえり（魔法人は上へ広がる／軍人はまっすぐな筒）
  const ct=new THREE.TorusGeometry(sold?.22*W:.25*W,.016,6,8);ct.rotateX(Math.PI/2);if(!fr)part(body,ct,sold?C.mantle:C.trim,0,(sold?1.72:1.69)*H,0);
  const by=1.0*H,br=rAt(by)*1.035;const belt=new THREE.TorusGeometry(br,.03,6,8);belt.rotateX(Math.PI/2);if(!fr)part(body,fold(belt,by),C.sash,0,by,0);   // 腰の帯
  if(fr){if(!sold){const bk3=fr==='bulky',bt2=new THREE.TorusGeometry(rAt(by)*1.1,bk3?.05:.026,6,8);bt2.rotateX(Math.PI/2);const bm=part(body,bt2,C.sash,0,by,0);bm.scale.z=bk3?.85:.72;
    const lw=bk3?.5*W:.16*W,ll=(bk3?.55:.5)*H,lc=new THREE.BoxGeometry(lw,ll,.04);lc.translate(0,-ll/2,0);const lm=part(body,lc,(k,x,y)=>shade(k,C.panel,.75+.25*(1+y/ll)),0,by-.02,(bk3?.34*W:.17*W));lm.rotation.x=-.08;
    part(lm,new THREE.BoxGeometry(lw*1.04,.035,.05),C.trim,0,-ll,0)}}else if(sold){const kn=part(body,new THREE.SphereGeometry(.055,6,3),C.sash,0,by,br+.03);kn.scale.set(1.3,1,.8)}   // 帯の結び目（軍人）
  else part(body,new THREE.BoxGeometry(.075,.075,.025),C.trim,0,by,br+.012);          // 帯の留め金
  if(!fr)for(const[dx,len,rz]of sold?[[.04,.58,.06],[-.05,.44,-.08],[.005,.36,.0]]:[[.05,.5,.05],[-.06,.36,-.07]]){const t=new THREE.BoxGeometry(.07,len,.014);t.translate(0,-len/2,0);const m=part(body,t,(k,x,y)=>shade(k,C.sash,.9+.2*y/len),dx,by-.03,br+.02);m.rotation.z=rz}   // 帯の垂れ（前に2本）
  const legArr=[];   // 足（legs の時だけ）: 腰（関節）→太もも→ひざ（関節）→すね→足首（関節）→靴。ひざの曲がりは userData.kn（mageStep が歩く動きをつける）。足の長さは約2.2（全身の約5割）、太さは腰幅いっぱい
  if(legs){const Lt=Lt0,tl2=.52*Lt,sl2=Lt-tl2,ank=sl2-.1,rT=.22*W*LT,rK=.15*W*LT,rA=.1*W*LT,lx=.22*W*(GT?GT.lx:1);   // 太もも半径.22W・ひざ.15W・足首.1W（太め）/ 立ち幅 lx=.22W（左右の足の中心）
       // Lt=腰から地面まで / ank=ひざから足首までの長さ
    for(const sx of[-1,1]){const lg=new THREE.Group();lg.position.set(sx*lx,.95*H,0);body.add(lg);
      if(fr){const bk=fr==='bulky',rT2=(bk?.3:.22)*W,rK2=(bk?.2:.14)*W,rA2=(bk?.13:.09)*W;   // 体格の脚: 太もも・膝・すね・足首の太さ（bulky=太い脚 / lanky=細く長い脚）。ローブの鎧飾りは付けない
        part(lg,new THREE.SphereGeometry(rT2*1.02,6,3),C.robe,0,0,0);
        const th=new THREE.LatheGeometry(V2([[.001,-tl2],[rK2*1.05,-tl2],[rK2*(bk?1.35:1.2),-tl2*.82],[rT2*(bk?.98:1.12),-tl2*.45],[rT2*1.08,-tl2*.12],[rT2*.95,0],[.001,0]]),8);part(lg,th,(k,x,y)=>shade(k,C.robe,.72+.25*(1+y/tl2)),0,0,0);
        part(lg,new THREE.SphereGeometry(rK2*1.1,6,3),C.robe,0,-tl2,0);
        const kn=new THREE.Group();kn.position.y=-tl2;lg.add(kn);lg.userData.kn=kn;
        const sh=new THREE.LatheGeometry(V2([[.001,-ank],[rA2,-ank],[rA2*1.12,-.78*ank],[rK2*(bk?1.3:1.2),-.36*ank],[rK2*.95,-.05*ank],[rK2*.95,0],[.001,0]]),8);part(kn,sh,(k,x,y)=>shade(k,C.robe,.7+.22*(1+y/ank)),0,0,0);
        part(kn,new THREE.SphereGeometry(rA2*1.2,6,3),C.robe,0,-ank,0);
        const ft=new THREE.Group();ft.position.y=-ank;kn.add(ft);lg.userData.ft=ft;   // 足先: 毎フレーム、地面と平らになるよう向きを補正する（mageStep）
        part(ft,new THREE.BoxGeometry(rA2*(bk?3:2.6),.2,bk?.5:.42),0x2a2420,0,0,.1);
        part(ft,new THREE.SphereGeometry(rA2*1.6,6,3),0x2a2420,0,-.04,.27).scale.set(1,.55,1);
        legArr.push(lg);continue}
      part(lg,new THREE.SphereGeometry(rT*.98,6,3),C.robe,0,0,0);   // 腰のつけ根（関節）
      const th=new THREE.CylinderGeometry(rT,rK,tl2,6);th.translate(0,-tl2/2,0);part(lg,th,(k,x,y)=>shade(k,C.robe,.72+.25*(1+y/tl2)),0,0,0);   // 太もも
      part(lg,new THREE.SphereGeometry(rK*1.15,6,3),sold?C.armor:C.mantle,0,-tl2,0);   // ひざ（関節。ひざ当て）
      const kr=new THREE.TorusGeometry(rK*1.12,.018,6,8);kr.rotateX(Math.PI/2);part(lg,kr,C.trim,0,-tl2+.02,0);   // ひざの上の金の輪
      const kn=new THREE.Group();kn.position.y=-tl2;lg.add(kn);lg.userData.kn=kn;
      const sh=new THREE.CylinderGeometry(rK*.98,rA,ank,6);sh.translate(0,-ank/2,0);part(kn,sh,(k,x,y)=>shade(k,sold?C.armor:C.robe,.7+.22*(1+y/ank)),0,0,0);   // すね（軍人はすね当て）
      part(kn,new THREE.SphereGeometry(rA*1.25,6,3),C.mantle,0,-ank,0);   // 足首（関節）
      const ar=new THREE.TorusGeometry(rA*1.2,.016,6,8);ar.rotateX(Math.PI/2);part(kn,ar,C.trim,0,-ank+.07,0);   // 足首の上の金の輪
      const bt=part(kn,new THREE.BoxGeometry(rA*3.4,.2,.4),0x2a2420,0,-ank,.1);   // 靴（つま先が前）
      part(kn,new THREE.SphereGeometry(rA*1.7,6,3),0x2a2420,0,-ank-.04,.27).scale.set(1,.55,1);   // つま先の丸み
      const AR=sold?C.armor:C.panel;   // 脚鎧の色（軍人=鎧 / ほか=飾り帯の色。第一属性の色にも追従）
      const cu=new THREE.CylinderGeometry(rT*1.2,rK*1.28,tl2*.8,6);cu.translate(0,-tl2*.42,0);part(lg,cu,(k,x,y)=>shade(k,AR,.75+.3*(1+y/tl2)),0,0,0);   // 太ももの鎧（草摺の下の腿当て）
      for(const[fy,fr]of[[-.03*tl2,rT*1.21],[-.8*tl2,rT*1.2+(rK*1.28-rT*1.2)*.78]]){const t=new THREE.TorusGeometry(fr,.016,5,8);t.rotateX(Math.PI/2);part(lg,t,C.trim,0,fy,0)}   // 腿当ての上下の金の縁
      const fl=new THREE.BoxGeometry(rT*2.1,tl2*.62,.03);fl.translate(0,-tl2*.31,0);const fm=part(lg,fl,(k,x,y)=>shade(k,C.mantle,.8+.3*(1+y/(tl2*.62))),0,0,rT*1.3);fm.rotation.x=.1;   // 腿の前に垂れる布（脚と一緒に振れる）
      part(fm,new THREE.BoxGeometry(rT*2.14,.03,.036),C.trim,0,-tl2*.62,0);   // 布の裾の金の縁
      const kc=part(lg,new THREE.SphereGeometry(rK*1.5,6,3),AR,0,-tl2,rK*.15);kc.scale.set(1,.85,1.1);   // 大きな膝当て
      const ks=part(lg,new THREE.ConeGeometry(rK*.45,.2,6),C.trim,0,-tl2,rK*1.6);ks.rotation.x=Math.PI/2;   // 膝当ての前のとげ
      const gv=new THREE.CylinderGeometry(rK*1.25,rA*1.4,ank*.88,8,1,true,-1.9,3.8);gv.translate(0,-ank*.46,0);part(kn,gv,(k,x,y)=>shade(k,AR,.7+.3*(1+y/ank)),0,0,0);   // すね当て（前から横をおおう板。後ろは開く）
      for(const[gy,gr]of[[-.03*ank,rK*1.27],[-.9*ank,rA*1.43]]){const t=new THREE.TorusGeometry(gr,.016,5,8);t.rotateX(Math.PI/2);part(kn,t,C.trim,0,gy,0)}   // すね当ての上下の金の縁
      part(kn,new THREE.CylinderGeometry(rA*1.55,rA*1.3,.14,6),0x3a302a,0,-ank+.1,0);   // 靴の履き口（折り返し）
      legArr.push(lg)}
    if(!fr){const L=.62*H,ty=.95*H,tz=rAt(ty)*1.04+.02,tw=.34*W;   // 前後の垂れ幕（腰の帯から膝まで。前は長く・後ろは少し短い）
      for(const[sg,ln]of[[1,1],[-1,.8]]){const LL=L*ln,pn=new THREE.BoxGeometry(tw,LL,.025);pn.translate(0,-LL/2,0);
        const m=part(body,pn,(k,x,y)=>shade(k,C.panel,.8+.25*(1+y/LL)),0,ty,tz*sg);m.rotation.x=-.05*sg;
        part(m,new THREE.BoxGeometry(tw*1.03,.035,.032),C.trim,0,-LL,0);   // 裾の金の縁
        part(m,new THREE.BoxGeometry(.012,LL*.8,.03),C.trim,tw*.5,-LL*.45,0);part(m,new THREE.BoxGeometry(.012,LL*.8,.03),C.trim,-tw*.5,-LL*.45,0);   // 左右の縁どり
        if(sg>0){const em=part(m,new THREE.OctahedronGeometry(.055),C.trim,0,-.15*H,.02);em.scale.set(1,1.5,.5)}}}   // 前の垂れ幕の紋
    }
  let swHold=null,swBlade=null;const arms=[],fists=[],hands=mageHandGeos(),HS=1.5*(fr==='bulky'?1.6:fr==='lanky'?1.45:1);   // HS=人間ベースの手を何倍にするか
  const SPF=fr==='bulky'?[[.17,-1.05],[.2,-1.0],[.3,-.9],[.36,-.76],[.33,-.62],[.27,-.55],[.3,-.48],[.38,-.32],[.45,-.14],[.42,-.02],[.34,.03]]:fr==='lanky'?[[.05,-1.05],[.062,-1.0],[.09,-.88],[.105,-.76],[.09,-.62],[.07,-.55],[.085,-.48],[.11,-.32],[.125,-.14],[.115,-.03],[.09,.02]]:null;   // 腕の輪郭（半径,高さ。W・H単位）: bulky=肩から手へ向かって細くなる太い腕 / lanky=細く長い腕
  const sp=(fr?SPF:(sold?[[.17,-1.05],[.16,-.9],[.15,-.6],[.14,-.3],[.12,-.05]]:[[.26,-1.05],[.2,-.92],[.14,-.68],[.115,-.35],[.105,-.05]])).map(q=>[q[0]*W*AT,q[1]*H*AL]);
  const ARMX=sold?(.52*TS*W+(SHW-1)*.476*W):fr==='bulky'?rAt(1.52*H)+.1*W:fr==='lanky'?rAt(1.48*H)+.06*W:.3*W+(SHW-1)*rAt(1.48*H);   // 肩から腕までの横の距離（体格ごと）   // 袖の縦の形（袖口→肩）。魔法人は袖口が広がる／軍人はほぼまっすぐ
  for(const[s,ay,rz0,qk]of insp?[[-1,1.48,.62,1],[1,1.48,.62,1],[-1,1.3,.2,.4],[1,1.3,.2,.4]]:sold?[[-1,1.48,.12,1],[1,1.48,.12,1]]:[[-1,fr==='bulky'?1.52:1.48,.18,1],[1,fr==='bulky'?1.52:1.48,.18,1]]){                                              // 長い袖: 肩から袖口へ向かって広がる。手だけが袖口から出る
    const A=new THREE.Group();const lower=qk<1;A.position.set(s*ARMX,ay*H,0);A.rotation.z=s*rz0;A.userData.rz0=rz0;A.userData.qk=qk;body.add(A);arms.push(A);
    part(A,new THREE.SphereGeometry((fr==='bulky'?.38:fr==='lanky'?.16:.12)*W,6,3),C.robe,0,0,0);          // 肩
    if(sold){for(const[pr,py]of[[.15,.07],[.18,-.01],[.21,-.09]]){   // 軍人の肩の鎧: 丸い板（半球の殻）を3枚、下へ向かって大きくなるように重ねる（肩当て）。縁に金の細い輪
      const pl=part(A,new THREE.SphereGeometry(pr,8,3,0,Math.PI*2,0,Math.PI/2),(k,x,y)=>shade(k,C.armor,.72+.38*Math.max(0,y)/pr),0,py,0);pl.scale.set(1.2,.55,1.1);
      const rt=new THREE.TorusGeometry(pr,.011,5,8);rt.rotateX(Math.PI/2);const rm=part(A,rt,C.trim,0,py,0);rm.scale.set(1.2,1,1.1)}}   // 肩の鎧（板3枚＋縁の輪）。腕と一緒に動く
    const sl=new THREE.LatheGeometry(V2(sp.concat([[.001,0]])),8);   // 袖のひだ
    if(!fr)    {const q=sl.attributes.position;for(let i=0;i<q.count;i++){const x=q.getX(i),y=q.getY(i),z=q.getZ(i),f=Math.max(0,Math.min(1,-y/(1.05*H*AL))),k=1+.07*f*Math.sin(Math.atan2(x,z)*7);q.setXYZ(i,x*k,y,z*k)}sl.computeVertexNormals()}
    part(A,sl,(k,x,y,z)=>{shade(k,C.sleeve,.75+.35*(1+y/(1.05*H*AL)))},0,0,0);
    if(!fr)    for(const[yy,rr,tb]of sold?[[-1.05*H*AL,.17*W*AT*1.06,.02],[-.92*H*AL,.16*W*AT*1.04,.012]]:[[-1.05*H*AL,.26*W*AT*1.07,.024],[-.92*H*AL,.2*W*AT*1.05,.014]]){const t=new THREE.TorusGeometry(rr,tb,6,8);t.rotateX(Math.PI/2);part(A,t,C.trim,0,yy,0)}   // 袖口の金の縁どり
    if(fr){const bk4=fr==='bulky',ey=-.55*H*AL;   // 肘のふくらみ・とげ、手首の輪
      part(A,new THREE.SphereGeometry((bk4?.27:.085)*W*AT,6,3),C.robe,0,ey,0);
      const ek=part(A,new THREE.ConeGeometry((bk4?.08:.035)*W*AT,(bk4?.3:.16)*W*AT,6),0xb9ad92,0,ey,-(bk4?.2:.07)*W*AT);ek.rotation.x=-Math.PI/2;
      if(bk4){const wt=new THREE.TorusGeometry(.2*W*AT,.04,6,8);wt.rotateX(Math.PI/2);part(A,wt,0x3a302a,0,-1.0*H*AL,0)}}
    const anchor=new THREE.Group();anchor.position.set(0,-1.05*H*AL-.2,.06);A.add(anchor);fists.push(anchor);   // 魔法を出す位置（手のひらのあたり）
    const hg=hands&&hands[s>0?'Left':'Right'];
    if(hg){const h=part(A,hg.clone(),C.skin,0,-1.05*H*AL+.05,0);h.scale.setScalar(HS)}   // 人間ベースの手
    else fists[fists.length-1]=part(A,new THREE.SphereGeometry(.07,6,3),C.skin,0,-1.1*H*AL,.03);   // （取り出せなかった時の代わり）
    if(sold&&s<0){const sh=new THREE.Group();sh.position.set(0,-1.05*H*AL+.05,0);sh.rotation.x=Math.PI+SSW_REST[1];A.rotation.order='YXZ';A.add(sh);   // 軍人: 腕は先に前後に振ってから体の縦軸で左右に振る(YXZ)。右手(s<0)に巨大な剣。握りの中心を手に合わせ、刃の縁が振る向きを向くように回す。向きは毎フレーム mageStep が決める
      const bs=(creSword||(creSword=makeSword())).clone();bs.rotation.y=Math.PI/2;bs.scale.set(SSW.SCALE*SSW.WIDE,SSW.SCALE,SSW.SCALE*SSW.WIDE);bs.position.y=-.2*SSW.SCALE;
      bs.traverse(m=>{if(m.isMesh)m.castShadow=true});sh.add(bs);swHold=sh;swBlade=bs}
  }
  const headY=1.69*H+.45,head=new THREE.Group();head.position.y=headY;if(fr==='lanky')head.rotation.z=.2;body.add(head);   // 頭: 胴から離れて浮く菱形
  const hsh=headShape||'diamond';let hGeo,hEx=.045,hEy=.03-(insp&&!hatless?.07:0),hEz=.075,hTop=.34;   // 頭の形（キーパーだけ抽選）: diamond=菱形 / funnel=細い筒の上が広がったラッパ形 / cone=円錐 / ring=上が開いた太い輪。目の位置は形ごとに表面へ合わせる
  if(hsh==='funnel'){hGeo=new THREE.LatheGeometry(V2([[.001,-.28],[.13,-.28],[.13,-.045],[.153,.08],[.2,.17],[.234,.224],[.27,.28],[.001,.28]]),8);hEy=-.1;hEz=.127;hTop=.28}
  else if(hsh==='cone'){hGeo=new THREE.ConeGeometry(.24,.62,8);hEy=-.06;hEz=.138;hTop=.31}
  else if(hsh==='ring'){hGeo=new THREE.TorusGeometry(.24,.06,6,12,Math.PI*2-.7);hGeo.rotateZ(Math.PI/2+.35);hGeo.scale(1,1,.7);hEx=.07;hEy=-.235;hEz=.046;hTop=.3}   // 輪: 上に切れ目（すき間）。目は下の太い部分の正面
  else{hGeo=new THREE.OctahedronGeometry(1,0);hGeo.scale(.13,.34,.12)}
  part(head,hGeo,C.head,0,0,0);
  if(insp&&!hatless){const hat=new THREE.Group();hat.rotation.x=.1;head.add(hat);   // スパイ風の帽子: ツバが広く、頭（菱形）の上半分をおおう。下のとがった顔だけがツバの下に見える
    part(hat,new THREE.LatheGeometry(V2([[.12,.07],[.3,.058],[.47,.07],[.52,.115],[.49,.12],[.3,.1],[.12,.125]]),8),C.hat,0,0,0);   // ツバ（先が少し反る）
    part(hat,new THREE.LatheGeometry(V2([[.15,.1],[.135,.24],[.115,.33],[.001,.335]]),8),C.hat,0,0,0);   // 山（上へ向かって細く・上は平ら）
    const hb=new THREE.TorusGeometry(.14,.017,6,8);hb.rotateX(Math.PI/2);part(hat,hb,C.band,0,.15,0)}   // 帽子の帯
  const eyeMat=new THREE.MeshBasicMaterial({color:C.eye}),eyeGeo=new THREE.BoxGeometry(.04,.014,.01),eyes=new THREE.Group();   // 光る細い目
  for(const s of[-1,1]){const e=new THREE.Mesh(eyeGeo,eyeMat),jv=mageJf(s*hEx,hEy,hEz);e.position.set(s*hEx+jv[0],hEy+jv[1],hEz+jv[2]);e.rotation.z=-s*.25;eyes.add(e)}   // 頭の表面のゆがみに合わせて目もずらす
  head.add(eyes);
  const gm={dispose(){for(const q of geos)q.dispose();eyeGeo.dispose();eyeMat.dispose()}};
  const C0=Object.assign({},C),inv={};for(const k0 in C0)inv[C0[k0]]=k0;   // 元の色→パレットの名前（16進で渡した部分を、あとで新しい色に置き換えるため）
  const recolor=over=>{Object.assign(C,over);const k=new THREE.Color();   // 服のパレットを差し替えて、頂点の色を塗り直す（ゲートキーパーの第一属性の色）
    for(const pr of parts){const ps=pr.geo.attributes.position,ca=pr.geo.attributes.color;let cc=pr.col;if(typeof cc!=='function'){const nm=inv[cc];if(nm!==undefined)cc=C[nm]}
      for(let i=0;i<ps.count;i++){if(typeof cc==='function')cc(k,ps.getX(i),ps.getY(i),ps.getZ(i));else k.set(cc);ca.setXYZ(i,k.r,k.g,k.b)}ca.needsUpdate=true}};
  if(DZ!==1){const ba=body.add.bind(body);body.add=function(...os){for(const o of os){if(o&&!o.userData.flatDone){o.userData.flatDone=true;o.position.z*=DZ;if(o.isMesh)o.scale.z*=DZ}}return ba(...os)}}   // 作ったあとに胴へ付く装飾（gkDecorate など）は、位置と形を同じ割合で前後に薄くする（回る輪などのグループは位置だけ）
  return{g,body,leanNode:body,by:body.position.y,pose:POSE,gait:GT,frame:fr,prof:PROF,ts:TS,extraH:legs?1.27*H*(LK-1):0,legs:legs?legArr:null,arms,fists,head,headY,eyes,mat,gm,recolor,hatless:!!hatless,headShape:hsh,headTop:hTop,mesh:new THREE.Object3D(),swH:swHold,swB:swBlade};
}
// ---------- 魔法人・調査員の戦い方: 魔法の連打を止めて、「防御」と「隙を突く」戦いにする ----------
// 敵対した魔法人は「結界」を張る。魔法はほとんど通らず(MAGIC_K)、剣などの物理も弱まる(MELEE_K)。受けた攻撃は結界ゲージ(bar)を削る。
//  ・隙   : 魔法を撃った直後 RECOV 秒は結界が消える。その間は大ダメージ(OPEN_K倍)。撃ったあとが攻めどき
//  ・崩し : 剣などで結界ゲージを削りきると STAG 秒、動けなくなって大ダメージ(STAG_K倍)
//  ・弾き : 剣を振った瞬間(DEFL_T秒以内)に敵の火・水・雷が当たると、はじき返して隙を作る（氷は足もとの予兆を見て動いてよける）
//  ・詠唱 : 光を集めている最中に剣が当たると、魔法を中断させる。近づくと、後ろへ下がる(KEEP,BACK)
//  ・不意打ち（敵対する前）は結界なしで通る。 MGD.ON=false で元の戦い方に戻る
const MGD={ON:true,BAR:[150,220],MAGIC_K:.1,MELEE_K:.45,BAR_MAGIC:.15,BAR_MELEE:.8,RECOV:0,STAG:5,OPEN_K:1.6,STAG_K:1,REGEN:.6,REGEN_WAIT:2.5,REGEN_S:10,KEEP:4,BACK:2.8,INTR_BAR:1.5,INTR_WAIT:1.8,DEFL_T:.3,DEFL_BAR:.4,toastAt:0,hint:false};
// BAR=結界ゲージ(最小,最大) / MAGIC_K・MELEE_K=結界がある間に通るダメージの割合 / BAR_MAGIC・BAR_MELEE=ダメージ1あたり結界ゲージが減る量 / RECOV=撃った後の隙(秒) / STAG=崩れている秒数 / OPEN_K・STAG_K=隙・崩れ中のダメージ倍率 / REGEN=崩れから戻った時のゲージの割合 / REGEN_WAIT・REGEN_S=攻撃されなければ REGEN_WAIT 秒後から毎秒 REGEN_S 回復 / KEEP=この距離より近いと下がる(m) BACK=下がる速さ(m/秒) / INTR_BAR=詠唱を止めた時のゲージ減少の倍率 / INTR_WAIT=止められたあと次に撃つまで(秒) / DEFL_T=剣を振り始めてから「弾き」が効く秒数 / DEFL_BAR=弾いた時に減るゲージの割合
function mageToast(msg,gap){const n=performance.now();if(n<MGD.toastAt)return;MGD.toastAt=n+(gap||6000);if(typeof gameToast==='function')gameToast(msg)}
function mageBarInit(c){if(c.barMax===undefined){c.barMax=c.bar=MGD.BAR[0]+Math.floor(Math.random()*(MGD.BAR[1]-MGD.BAR[0]+1));c.stag=0;c.open=0;c.barF=0;c.barHit=0}}
function mageNoBar(c){return !c.gk||!c.gkBarrier}                    // 結界（シールド）は、高エネルギーの抽選に当たったゲートキーパーだけが持つ（普通の魔法人・調査員などゲートキーパー以外は持たない）
function mageGuard(c,damage,melee,dot){                              // 魔法人が受けるダメージを、結界・隙・崩れで変える（harmCreature から呼ぶ）。敵対前の不意打ちは素通し
  if(!MGD.ON||!c.hostile||c.dead!==undefined||!(damage>0)||damage>=9000||mageNoBar(c))return damage;
  mageBarInit(c);
  if(c.stag>0)return damage*MGD.STAG_K;                              // 結界が崩れている間（結界なし。倍率は STAG_K）
  if(c.open>0)return damage*MGD.OPEN_K;                              // 魔法を撃った直後の隙
  let k=1;
  if(melee&&c.bT>=0&&!c.bShot){c.bT=-1;c.bShot=false;c.bFl=false;c.bWait=MGD.INTR_WAIT;k=MGD.INTR_BAR;mageToast('詠唱を止めた！',3000)}   // 光を集めている最中に殴られた: 魔法は不発
  c.barHit=MGD.REGEN_WAIT;c.barF=1;
  c.bar-=damage*(melee?MGD.BAR_MELEE:MGD.BAR_MAGIC)*k;
  if(!MGD.hint&&!dot){MGD.hint=true;if(typeof gameToast==='function')gameToast('結界がある！ ダメージはほとんど通らない。剣などで結界を壊せ')}
  if(c.bar<=0)mageBreak(c);
  return damage*(melee?MGD.MELEE_K:MGD.MAGIC_K);
}
function mageBreak(c){                                               // 結界が崩れた: しばらく動けず、大ダメージを受ける
  c.bar=0;c.stag=MGD.STAG;c.open=0;c.barF=0;   // ダウンはしない（動き・魔法はそのまま）。STAG秒のあいだ結界を張り直さない
  const x=c.x,y=c.y+(c.jy||0)+(c.size||1)*1.7,z=c.z;
  magePop(c);
  enemyFlash(new THREE.Vector3(x,y,z),'ice',(c.size||1)*1.4);
  if(audioSamples.armorSample)playSample('armorSample',.9);
  if(navigator.vibrate)navigator.vibrate(40);
  mageToast('結界が壊れた！ 今がチャンス',4000);
}
const DEFL_W=['sword','scimitar','iron_spear','spear','iron_dagger','dagger'];   // 弾きに使える武器
function swordDeflect(c){                                            // 剣を振っている最中に敵の魔法が当たった: はじき返す（true=防いだ）
  if(!MGD.ON||STAT.dead||!(sw.t>=0)||sw.t>MGD.DEFL_T)return false;
  const cur=INV.current;if(!cur||DEFL_W.indexOf(cur.id)<0)return false;
  const P=new THREE.Vector3(player.x,player.y-.5,player.z);
  enemyFlash(P,'blast',1.2);fireBurst(P.x,P.y,P.z,14,6);
  if(audioSamples.armorSample)playSample('armorSample',.9);
  if(navigator.vibrate)navigator.vibrate(30);
  if(c&&c.dead===undefined&&c.hp>0&&!mageNoBar(c)){
    mageBarInit(c);
    if(!(c.stag>0)){c.bar-=c.barMax*MGD.DEFL_BAR;if(c.bar<=0)mageBreak(c)}
  }
  mageToast(c&&mageNoBar(c)?'はじき返した！':'はじき返した！ 結界を削った',3000);
  return true;
}
let MGD_GEO=null,MGD_WGEO=null;
function mageBarMesh(c){                                             // 結界の見た目: なめらかな球（うっすら光る面）＋その上の網目
  if(!MGD_GEO){MGD_GEO=new THREE.SphereGeometry(1,40,28);MGD_WGEO=new THREE.IcosahedronGeometry(1.004,2)}
  const mk=(w)=>new THREE.MeshBasicMaterial({color:0x9fdcff,wireframe:w,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),
        mat=mk(false),wmat=mk(true),m=new THREE.Mesh(MGD_GEO,mat),w=new THREE.Mesh(MGD_WGEO,wmat);
  m.add(w);m.position.set(0,MAGE.H*1.0,0);m.renderOrder=4;w.renderOrder=5;m.frustumCulled=false;w.frustumCulled=false;m.visible=false;c.g.add(m);c.barM=m;c.barW=w;
  const dp=c.gm.dispose;c.gm.dispose=function(){dp.call(c.gm);mat.dispose();wmat.dispose()};
  return m;
}
function mageBarVis(c){
  const up=!!c.hostile&&!mageNoBar(c)&&c.dead===undefined&&!(c.stag>0)&&!(c.open>0)&&c.bar>0;
  if(!up&&!c.barM)return;
  const m=c.barM||mageBarMesh(c);m.visible=up;if(!up)return;
  const r=c.bar/c.barMax,tm=performance.now()/1000,fl=c.barF||0,bl=(r<.3?(.6+.4*Math.sin(tm*18)):1),col=r<.35?0xffb060:0x9fdcff;
  m.material.opacity=Math.min(.7,.07+.1*r+.4*fl)*bl;m.material.color.setHex(col);
  c.barW.material.opacity=Math.min(1,.3+.3*r+.5*fl)*bl;c.barW.material.color.setHex(col);
  m.scale.setScalar(1.9*(1+.04*fl));
}
function magePop(c){                                                 // 結界が弾ける: 網目の球がふくらんで消え、光のかけらが四方へ飛ぶ
  const cx=c.x,cy=c.y+(c.jy||0)+(c.size||1)*MAGE.H*1.0,cz=c.z,R0=1.9*(c.size||1);
  const mat=new THREE.MeshBasicMaterial({color:0xbfe8ff,wireframe:true,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),
        mesh=new THREE.Mesh(MGD_WGEO||new THREE.IcosahedronGeometry(1,2),mat);
  mesh.position.set(cx,cy,cz);mesh.renderOrder=6;mesh.scale.setScalar(R0);scene.add(mesh);
  for(let i=0;i<70;i++){const u=Math.random()*2-1,a=Math.random()*6.283,q=Math.sqrt(1-u*u),dx=q*Math.cos(a),dy=u,dz=q*Math.sin(a),sp=5+Math.random()*7;
    addFirePart(cx+dx*R0,cy+dy*R0,cz+dz*R0,dx*sp,dy*sp,dz*sp,.4+Math.random()*.4,.05+.08*Math.random(),blastMats)}
  const t0=performance.now();
  (function tick(){const k=(performance.now()-t0)/400;
    if(k>=1){scene.remove(mesh);mat.dispose();return}
    mesh.scale.setScalar(R0*(1+.9*k));mat.opacity=1-k;requestAnimationFrame(tick)})();
}
function mageBarTick(c,dt){                                          // 毎フレーム: 隙・崩れの時間を進め、結界を少しずつ戻す
  if(!c.hostile)return;
  mageBarInit(c);
  if(c.open>0)c.open-=dt;
  if(c.barF>0)c.barF=Math.max(0,c.barF-dt*3);
  if(c.stag>0){c.stag-=dt;if(c.stag<=0){c.stag=0;c.bar=c.barMax*MGD.REGEN;c.barHit=0;enemyFlash(new THREE.Vector3(c.x,c.y+(c.size||1)*1.7,c.z),'ice',c.size||1)}}   // 立ち直って、結界が戻る
  else if(c.barHit>0)c.barHit-=dt;else if(c.bar<c.barMax)c.bar=Math.min(c.barMax,c.bar+MGD.REGEN_S*dt);
  mageBarVis(c);
}
function mageBack(c,dt){                                             // 近づかれたら、相手を向いたまま後ろへ下がる。下がった速さを返す
  const bx=c.x-player.x,bz=c.z-player.z,bl=Math.hypot(bx,bz)||1;
  pwP.x=c.x+bx/bl*MGD.BACK*dt;pwP.z=c.z+bz/bl*MGD.BACK*dt;pwPush(pwP,.5*c.size,c.y+(c.jy||0));
  const h=pwH(c,pwP.x,pwP.z);
  if(h>=WATER+.2&&waterDepthAt(pwP.x,pwP.z,h)<=.35&&Math.abs(h-c.y)<.5){c.x=pwP.x;c.z=pwP.z;return MGD.BACK}
  return 0;
}
function mageChips(c){for(let i=0;i<3;i++)addSmoke(c.x+(Math.random()-.5)*.6*c.size,c.y+(.6+Math.random()*1.2)*c.size,c.z+(Math.random()-.5)*.6*c.size,.15+Math.random()*.15,MAGE.DUST)}   // 殴られた・魔法が当たった: 紫の粉が飛ぶ
// ---------- ゲートキーパーの体・服・装飾・作り方（gkRollSpec）・makeGkHuman・攻撃方法の見た目 は gatekeeper.js に分離 ----------
function spawnMage(at,kind){                                              // 目の前7mの地面に出す（プレイヤーの方を向く）
  const sp=(at&&at.gk)?gkRollSpec(kind):null,kd=sp?sp.kd:(kind||'mage'),K=CRE_KINDS[kd],fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw),x=at?at.x:player.x+fx*7,z=at?at.z:player.z+fz*7;
  const hs=K.size*(.95+Math.random()*.1)*(sp&&sp.frame==='bulky'?1.15:1),G=(sp&&(sp.armor&&sp.first==='a'&&sp.helm&&!sp.helm.halo&&Math.random()<GKA.HOLY_HELM_P&&(sp.helm=gkRollHolyHelm(Math.random)),true)&&makeGkHuman(hs,kd,sp.frame,sp.head,sp.arms===4,sp.robed,(sp.armor&&sp.first==='e'?'blast':(sp.armor&&sp.first==='a'?'holy':sp.armor)),sp.style,(sp.shield=(sp.style==='sword'||sp.style==='spear'||sp.style==='axe')&&Math.random()<SHD.P?(Math.random()<SHD.SMALL_P?'small':'big'):false),sp.bulge,sp.gold,sp.pat,sp.armorCol,sp.deco,sp.helm))||makeMage(hs,kd,sp?sp.hatless:false,sp?sp.head:'diamond',sp?sp.frame:false,sp?GKA.SHAPE:null),y=supportAt(x,z,at?heightAt(x,z):player.gy),hp=MAGE.HP[0]+Math.floor(Math.random()*(MAGE.HP[1]-MAGE.HP[0]+1));
  const c={g:G.g,mesh:G.mesh,gm:G.gm,mat:G.mat,G,golem:true,mage:true,kind:kd,hy:K.hy,walker:true,bT:-1,bWait:1+Math.random()*2,size:hs,off:0,x,y,z,yaw:(at&&at.yaw!==undefined)?at.yaw:pwYawTo(player.x-x,player.z-z),hx:x,hz:z,tx:x,tz:z,wait:.5+Math.random()*1.2,t:Math.random()*20,lean:0,armX:.03,hp,maxHp:hp,phys:K.phys,def:K.def,mana:K.mana[0]+Math.floor(Math.random()*(K.mana[1]-K.mana[0]+1)),spdK:.85+Math.random()*.3,phase:0,amp:0,run:0,gear:null};
  if(kd==='inspector')c.inspector=true;
  if(kd==='soldier'){c.soldier=true;c.swT=-1;c.swHit=false;c.swWait=.3+Math.random()*.3;if(sp&&sp.style==='spear')c.gkSpear=true;else if(sp&&sp.style==='axe')c.gkAxe=true;else if(sp&&sp.style==='great'){c.gkAxe=true;c.gkGreat=true}else if(sp&&sp.style==='dual')c.gkDual=true;else if(sp&&sp.style==='quad')c.gkQuad=true;else if(at&&at.gk&&Math.random()<.4)c.swLow=true;c.sPose=(c.gkGreat?GS_REST:c.gkAxe?AX_REST:c.gkSpear?SPR_REST:(c.gkDual||c.gkQuad)?DW_REST:c.swLow?SSW_LREST:SSW_REST).slice();if(c.gkQuad)c.sPose2=DW_REST.slice()}   // 四刀流(c.gkQuad)は4本の腕すべてに剣   // 双剣型(c.gkDual)は両手に剣   // 槍型(c.gkSpear)は槍を立てて持つ   // ゲートキーパーの剣型は、4割の確率で「剣を下げて持つ」タイプ（c.swLow）   // 軍人: 巨大な剣の振りの状態（swT=振っている経過秒 -1=していない）
  if(at&&at.gk){c.gk=true;c.guardYaw=at.yaw;if(at.entry)at.entry.c=c;c.gkSpec=sp;   // ゲートキーパーは段階方式で作る: ①体型 → ②腕の数 → ③攻撃方法 → ④装飾（決め方は gkRollSpec、ここはその結果から組み立てる）
    // ===== ① 体型（頭以外）: 3タイプ（普通=robe / 細長い=lanky / 太い=bulky）。体格は makeGkHuman に渡して作成済み（人間ベースの体。体格ごとに脚・腕の長さや胴の太さが変わる） =====
    c.gkArms=sp.arms;   // ② 腕の数（2か4。体は makeGkHuman が、4本なら上の2本＋下の2本で作成済み）
    c.gkBody=sp.frame;   // 体格（robe=ふつうの体型 / lanky=手足が長い / bulky=上半身が太い）。形は makeGkHuman が作る
    if(G.hyMid!==undefined)c.hy=G.hyMid;else if(G.legs)c.hy+=.16*MAGE.H+(G.extraH||0)/2;   // 足があるタイプは背が高い（上半身を持ち上げた分）: 当たる高さの中心を体の高さに合わせる（人間ベースの体は G.hyMid=全身の高さの半分。makeMage の体は従来どおり上げる）
    // ===== ③ 攻撃方法（暫定）の前半 = 属性: 第一〜第十属性を割り振る（第一属性=第二属性以降で一番多い属性）。服と装飾のメインの色を第一属性の色系統に合わせる =====
    c.gkAttributes=[sp.first].concat(sp.extra);c.gkFirst=sp.first;c.gkSwP=sp.swP||null;
    {const pl=gkClothPal(c.gkFirst);if(pl){c.gkCloth=pl.cloth;G.recolor(pl.C)}}   // 体の色を、第一属性の色系統に合わせる（肌の色を属性の色へ GKH.TINT の割合で寄せる。頭と手は肌のまま）
    c.gkBarrier=c.gkAttributes.includes('a')&&Math.random()<GKA.BARRIER_P;   // バリア: 高エネルギーの抽選に当たった番人だけが結界を張る
    // ===== ③ 攻撃方法（暫定）の後半 = 攻撃型: 魔法人型(mage)=人型 / 調査員型(inspector)=多肢型 / 軍人型(soldier)=剣型。第一属性を、タイプごとの通常攻撃（魔法・腕・剣）へ結びつけ、攻撃の一覧を作る =====
    {const f=c.gkFirst;
      if(kd==='mage')c.gkSpell=f;   // 魔法人: 通常攻撃は第一属性の魔法（闇・高エネルギー・操作・支配・創造・爆破もビームで撃つ。当たった時の効果は gkElemHit）
      else if(kd==='inspector'){c.gkSpell=f;const ix=INSP_ELEM.indexOf(f);c.gkArm=ix>=0?ix:Math.floor(Math.random()*4)}   // 調査員: 氷・火・雷・水は対応する腕で撃つ／それ以外は適当な1本の腕から撃つ
      else{c.gkSpell=f;c.swElem=(f==='fire'||f==='ice'||f==='thunder')?f:undefined}}   // 軍人: 剣の属性は第一属性が火・氷・雷の時だけ。ほか（闇・支配・創造・爆破…）は、剣が当たった時に gkFirstTrait で効果が付く
    c.gkExtra=[];const usedGkAttacks=new Set();for(const el of c.gkAttributes.slice(1)){const atk=gkPickAtk((c.gkSpear||c.gkDual||c.gkQuad||c.gkAxe)?'spear':kd,el,usedGkAttacks);if(atk){usedGkAttacks.add(atk);c.gkExtra.push({el,atk})}const sp=gkPickSpecial(el,usedGkAttacks,(c.gkSpear||c.gkDual||c.gkQuad||c.gkAxe)?'spear':kd);if(sp){usedGkAttacks.add(sp);c.gkExtra.push({el,atk:sp})}}   // 攻撃方法は番人1体につき重複なし。一度選ばれた攻撃は以後の属性の抽選候補から除外し、候補切れなら攻撃なし
    c.shield=!!(sp&&sp.shield&&G.shd);c.shObj=c.shield?G.shd:null;c.shUp=0;c.shOn=false;c.shSmall=c.shield&&sp.shield==='small';c.shF=0;c.shPar=false;   // 盾持ち（c.shield）: 盾は左手が空いている剣型・槍型だけ
  c.gkAtks=(c.gkQuad?[{id:'normal',kind:'qdown',rng:'short'},{id:'normal',kind:'qside',rng:'short'},{id:'normal',kind:'spell',rng:'long'}]:c.gkDual?[{id:'normal',kind:'xdown',rng:'short'},{id:'normal',kind:'xside',rng:'short'},{id:'normal',kind:'spell',rng:'long'}]:c.gkGreat?[{id:'normal',kind:'adown',rng:'short'},{id:'normal',kind:'gsweep',rng:'short'},{id:'normal',kind:'spell',rng:'long'}]:c.gkAxe?[{id:'normal',kind:'adown',rng:'short'},{id:'normal',kind:'throw',rng:'long'},{id:'normal',kind:'spell',rng:'long'}]:c.gkSpear?[{id:'normal',kind:'thrust',rng:'short'},{id:'normal',kind:'rapid',rng:'short'},{id:'normal',kind:'sweep',rng:'short'},{id:'normal',kind:'spell',rng:'long'}]:kd==='soldier'?[{id:'normal',kind:'down',rng:'short'},{id:'normal',kind:'side',rng:'short'},{id:'normal',kind:'flip',rng:'short'},{id:'normal',kind:'spell',rng:'long'}].concat(gkSwExtra(c)):[{id:'normal',rng:kd==='inspector'?'long':'any'}]).concat(c.gkExtra.map(ex=>({id:'extra',ex,rng:GKA.RNG[ex.atk]||'any'})));   // 使える攻撃の一覧（普通の攻撃＋追加属性ごとの攻撃。軍人の普通の攻撃は「叩きつけ(down)」と「横振り(side)」の2つに分けて、それぞれ同じ確率で抽選される）。rng=撃つ距離（short=近い時 / long=遠い時 / any=どちらでも）。軍人の普通の攻撃=short、調査員の普通の攻撃と槍=long
    if(c.soldier)c.gkAtks.push({id:'normal',kind:'dash',rng:'any',min:MV.DASH.MIN},{id:'normal',kind:'leap',rng:'any',min:MV.LEAP.MIN});   // 動く攻撃: 突進・跳躍叩きつけ（剣・槍・双剣・四刀流・斧すべて。min=これより近い時は出さない）
    c.spT=-1;c.spWait=1+Math.random()*1.5;
    for(const t of gkPickCombos(c.gkAttributes,(c.gkSpear||c.gkDual||c.gkQuad||c.gkAxe)?'spear':kd)){const ex={el:GKA.COMBO[t].el,atk:t,combo:true};c.gkExtra.push(ex);c.gkAtks.push({id:'extra',ex,rng:GKA.COMBO[t].rng||'any'})}   // 組み合わせ攻撃: 属性の組が条件を満たしたら、同じ条件の攻撃の中から1つ抽選して追加（各属性の攻撃とは別枠） // 第一属性は必ず確定させる（追加属性がない場合も含む）
    c.gkStyle=sp.style;c.gkCH=GKA.STYLE[sp.style].ch;try{gkStyleBuild(c,G,sp.style)}catch(err){console.error(err)}
    if(c.gkStyle==='staff'&&!c.gkStaff){c.gkStyle='bare';c.gkCH=GKA.STYLE.bare.ch;try{gkStyleBuild(c,G,'bare')}catch(err){console.error(err)}}   // 装備と攻撃方法を一致させる: 杖が作れなかった（体を別の形で作った）時は、杖を持たない素手型にする   // ③ 攻撃方法: 魔法の溜め時間と、光の集まる位置（素手=頭上 / 杖=杖の先 / 剣=剣先）・杖の部品
    c.gkFxAnchor=new THREE.Object3D();c.gkFxAnchor.position.y=1.05*hs;G.g.add(c.gkFxAnchor);
    try{gkSignature(c,G,kd)}catch(err){console.error(err)}   // ④ 装飾: 第一属性ごとの固有の部品（形と動き）・追加属性の印
    if(sp.armless){c.armless=true;for(const A of G.arms)A.visible=false}   // 腕がない調査員: 4本の腕（肩・袖・手）を全部見えなくする。魔法の光は、見えない手があった位置に空中で集まる
    // ===== 服・マントは付けない（人間ベースの体のまま）。属性の見た目は 色づけと ④ の gkSignature の固有部品 =====
    c.gkSecondSpell=c.gkAttributes[1]||null; // 互換用。第二属性が抽選されなかった場合はnull
  }
  mageBarInit(c);
  G.g.position.set(x,y,z);G.g.rotation.y=c.yaw-PEASANT_FLIP;G.g.userData.hp=hp;scene.add(G.g);creatures.push(c);
  if(creatures.length>260){const o=creatures.shift();scene.remove(o.g);o.gm.dispose();o.mat.dispose()}
  return creatures.length;
}
function mageDeadStep(c,dt){                                         // 倒された: 前か後ろへ倒れ（0.8秒）、しばらく横たわってから薄れて消える。消えたら true
  const G=c.G;
  if(!c.shat){c.shat=true;c.dead=0;G.eyes.visible=false;if(c.barM)c.barM.visible=false;if(c.arc)c.arc.g.visible=false;c.g.rotation.order='YXZ';
    for(let i=0;i<10;i++)addSmoke(c.x+(Math.random()-.5)*1.2*c.size,c.y+(.2+Math.random()*1.6)*c.size,c.z+(Math.random()-.5)*1.2*c.size,.3+Math.random()*.4,MAGE.DUST)}   // 目の光が消え、紫の煙が出る
  c.dead+=dt;const T=c.dead,k=Math.min(1,T/.8),e=k*k;
  c.g.rotation.y=c.yaw-PEASANT_FLIP;c.g.rotation.x=(c.fall||1)*Math.PI/2*e;c.g.rotation.z=0;
  c.g.position.set(c.x,c.y+(c.jy||0)+.3*c.size*e,c.z);
  for(let i=0;i<G.arms.length;i++){const A=G.arms[i],rz0=A.userData.rz0===undefined?.18:A.userData.rz0;A.rotation.x*=1-Math.min(1,dt*4);A.rotation.z=((i%2)?1:-1)*(rz0+.4*e)}   // 腕はだらんと広がる
  if(T>MAGE.LIE){const f=Math.min(1,(T-MAGE.LIE)/MAGE.FADE);if(!c.fading){c.fading=true;c.mat.transparent=true;c.mat.needsUpdate=true}c.mat.opacity=1-f;if(G.swH)G.swH.scale.setScalar(Math.max(.001,1-f));return f>=1}
  return false;
}
function mageStep(c,dt){                                             // 魔法人1体の毎フレームの動き。薄れきったら true
  if(c.dead!==undefined){if(c.gkMeltOn)gkMeltRestore(c);if(c.gkRing)c.gkRing.visible=false;return mageDeadStep(c,dt)}
  const G=c.G;
  updateCreatureStatus(c,dt);
  if(c.dead!==undefined||c.hp<=0)return false;
  if(c.kv>.02){pwP.x=c.x+c.kx*c.kv*dt;pwP.z=c.z+c.kz*c.kv*dt;pwPush(pwP,.5*c.size,c.y+(c.jy||0));const h=pwH(c,pwP.x,pwP.z);   // 殴られた向きへ押される
    if(h>=WATER+.2&&waterDepthAt(pwP.x,pwP.z,h)<=.35&&Math.abs(h-c.y)<.5){c.x=pwP.x;c.z=pwP.z}c.kv*=Math.max(0,1-dt*6)}
  if(c.frozen>0){if(c.gkMeltOn)gkMeltRestore(c);c.frozen-=dt;if(c.frozen<=0){c.frozen=0;if(c.iceOld){c.mat.color.copy(c.iceOld);c.iceOld=null}}else return false}   // 凍っている間は止まる
  c.t+=dt;if(c.bWait>0)c.bWait-=dt;
  const zd=STAT.dead?1e9:Math.hypot(player.x-c.x,player.z-c.z),seen=zd<MAGE.SIGHT;
  if(c.gk&&!c.hostile&&GK.AGGRO>0&&seen&&zd<GK.AGGRO)c.hostile=true;
  if(c.spT>=0&&!(c.gkExtra&&c.gkExtra.length&&seen&&c.hostile))gkAtkCancel(c);   // 見失った・敵対でなくなったら、出しかけの攻撃はやめる
     // ゲートキーパーは、近づくと敵対する
  mageBarTick(c,dt);const stg=false;   // 結界の時間を進める（stg=結界が崩れて動けない間）
  const face=(sl)=>{let df=pwYawTo(player.x-c.x,player.z-c.z)-c.yaw;df=Math.atan2(Math.sin(df),Math.cos(df));const tr=PW.TURN*dt*sl;c.yaw+=Math.max(-tr,Math.min(tr,df));return df};
  if(c.soldier&&c.hostile&&!c.swElem&&!c.gk)c.swElem=['fire','ice','thunder'][Math.floor(Math.random()*3)];   // 軍人: 敵対したら、剣に火・氷・雷のどれかが付く（そのまま）
  if(c.soldier)soldierSwing(c,dt,face);   // 軍人: 剣を振っている時間を進める（当たる瞬間の判定もここ）
  let speed=0;
  if(c.bT>=0){                                                       // 魔法の最中: 両手を前へ上げて光を集める間は相手を追って狙い、光る直前に狙いを固める。光りきってから（雷・氷は待たずに）撃つ
    c.bT+=dt;const CH=chT(c),fin=CH+eDelay(c);
    if(c.bT<CH){face(.6);if(c.bT<CH-eLock(c))c.aim={x:player.x,y:player.y-.7,z:player.z}}
    else{if(!c.bFl){c.bFl=true;enemyFlash(chargePos(c),c.spell,c.size||1);justCue(c,c.spell)}   // 光りきった: ここから DELAY 秒が相殺のタイミング
      if(!c.bShot&&c.bT>=fin){c.golemO=chargePos(c);castEnemyMagic(c);c.bShot=true;c.open=MGD.RECOV}}
    if(c.bT>=fin+.5){c.bT=-1;c.bWait=(MAGE.WAIT[0]+Math.random()*MAGE.WAIT[1])*(c.gk?GKA.WAITK:1)}
  }else{
    if(c.gk&&c.gkAtks&&seen&&c.hostile){speed=gkAI(c,dt,face,zd)}   // ゲートキーパー: 距離（近い・遠い）に合った攻撃を、使える攻撃からランダムに選んで撃つ
    else if(c.soldier&&seen&&c.hostile){                                  // 軍人: 相手を向いて近づき、剣が届く距離で巨大な剣を振る（魔法は使わない。近づかれても下がらない）
      if(!(c.swT>=0)){const df=face(.8);if(c.swWait>0)c.swWait-=dt;
        if(zd<SSW.START&&!(c.swWait>0)&&Math.abs(df)<.5){c.swT=0;c.swHit=false;c.swSnd=false;c.swKind=sswPickKind();sswComboRoll(c)}   // 確率で横なぎ
        else if(zd>SSW.STOP){c.tx=player.x;c.tz=player.z;speed=golemWalk(c,dt,MAGE.CHASE*c.spdK)}}
    }else if(seen&&c.hostile){                                           // 敵対している（殴られた）間だけ、相手を向いて魔法を撃つ。そうでなければ歩き回る
      const df=face(.8);
      if(zd<MAGE.RANGE&&c.bWait<=0&&Math.abs(df)<.5){if(c.inspector){c.castArm=c.gkArm!==undefined?c.gkArm:Math.floor(Math.random()*4);c.spell=(c.gk&&c.gkSpell)?c.gkSpell:INSP_ELEM[c.castArm]}else c.spell=c.gkSpell||EMAG.TYPES[Math.floor(Math.random()*EMAG.TYPES.length)];c.aim={x:player.x,y:player.y-.7,z:player.z};c.bT=0;c.bShot=false;c.bFl=false;startEnemyCharge(c)}   // 使う魔法を決めて、両手の間に光を集め始める
      else if(MGD.ON&&zd<MGD.KEEP&&!(c.open>0)){speed=mageBack(c,dt)}   // 近すぎる: 相手を向いたまま下がる
      else if(zd>MAGE.RANGE*.8){c.tx=player.x;c.tz=player.z;speed=golemWalk(c,dt,MAGE.CHASE*c.spdK)}   // 遠い: 近づく
    }else if(c.gk){                                                  // ゲートキーパー: 持ち場に立って外を向く（戦いで離れたら持ち場へ戻る）
      if(Math.hypot(c.hx-c.x,c.hz-c.z)>1.2){c.tx=c.hx;c.tz=c.hz;speed=golemWalk(c,dt,MAGE.WALK*2*c.spdK)}
      else{let df=c.guardYaw-c.yaw;df=Math.atan2(Math.sin(df),Math.cos(df));c.yaw+=df*Math.min(1,dt*3)}
    }else if(c.wait>0){c.wait-=dt;if(c.wait<=0)pwPickTarget(c)}   // 気づいていない間は、ゆっくり歩き回る
    else{if(Math.hypot(c.tx-c.x,c.tz-c.z)<.3)c.wait=1.5+Math.random()*3;else speed=golemWalk(c,dt,MAGE.WALK*c.spdK)}
  }
  if(c.jv||c.jy>0)pwSettle(c,dt);else{const gy=pwH(c,c.x,c.z);c.y+=(gy-c.y)*Math.min(1,dt*4)}   // 地面の高さに合わせて滑らかに上下
  const t=c.t;
  c.amp+=((speed>.1?1:0)-c.amp)*Math.min(1,dt*6);c.phase+=speed*dt/(3*c.size)*6.283;
  c.lean+=((stg?.45:speed>.1?.1:0)-c.lean)*Math.min(1,dt*3);
  c.armX+=((stg?.15:seen&&c.hostile?-.3:.03)-c.armX)*Math.min(1,dt*3);
  let q=0;if(c.bT>=0){const a=c.bT,CH=chT(c),fin=CH+eDelay(c);q=a<CH?pwSmooth(a/CH):a<fin?1:1-pwSmooth((a-fin)/.5)}   // 魔法: 両腕を前へ上げ、手を体の前で寄せる（撃ったら戻す）
  if(c.spT>=0&&!c.fl&&!c.fz)q=Math.max(q,c.spT<(c.gkCH||GKA.SP.SUMMON)?pwSmooth(Math.max(0,c.spT/(c.gkCH||GKA.SP.SUMMON))):1);   // 追加属性の攻撃の準備中: 両腕を上げる
  if(c.cnT>0){c.cnT-=dt;q=Math.max(q,Math.min(1,c.cnT*4))}   // 相殺で撃った時: 手をさっと前へ上げて戻す
  c.bq=q;
  if(c.gkBook){const bk=c.gkBook,u=bk.userData,e=pwSmooth(Math.max(0,Math.min(1,q))),tt=c.t;   // 浮かぶ本: 魔法は手で撃つ。本は、キーパー側へ傾いたまま（読んでいる姿勢）。構えの間は少し浮き上がって傾きが深まり、ページがはためく（本を見ながら唱える）
    bk.position.y=u.y0+Math.sin(tt*1.7)*.045+.06*e;bk.position.z=.52;bk.rotation.y=Math.sin(tt*.9)*.12;u.tl.rotation.x=-.95-.2*e;
    for(const h of u.hf)h.g.rotation.z=h.sx*(.22+.1*e+.1*e*Math.sin(tt*22))}
  if(c.gkAnim)for(let i=0;i<c.gkAnim.length;i++)c.gkAnim[i](c.t,q);   // 属性の個性の部品の動き（回る飾り・ゆらめく炎・たなびく触手など）
  if(c.soldier){soldierPose(c,dt,seen&&c.hostile);soldierBody(c,dt)}G.leanNode.rotation.x=c.lean-.1*q+(G.pose?G.pose.lean:0)+(c.soldier?c.sPose[2]+c.sBody[0]:0);if(c.soldier)G.leanNode.rotation.y=c.sBody[1];G.leanNode.position.y=G.by+(G.legs?0:.05*Math.sin(t*1.7))+(G.gait?G.gait.bob*Math.abs(Math.cos(c.phase*G.gait.cad)):.03*Math.abs(Math.sin(c.phase)))*c.amp+(c.soldier?c.sBody[2]:0);if(G.gait){const GG=G.gait,pg=c.phase*GG.cad,ga=Math.min(1,c.amp||0),ty=-(GG.twist||0)*Math.sin(pg)*ga;G.leanNode.rotation.z=-GG.roll*Math.cos(pg)*ga;G.leanNode.rotation.x+=-(GG.nod||0)*Math.cos(2*pg)*ga;if(c.soldier)G.leanNode.rotation.y+=ty;else G.leanNode.rotation.y=ty}
  const th=c.armX+.05*Math.sin(t*1.6)-(G.pose?.9*G.pose.lean:0);
  for(let i=0;i<G.arms.length;i++){const A=G.arms[i],s=(i%2)?1:-1,rz0=A.userData.rz0===undefined?.18:A.userData.rz0,qk=c.inspector?(i===c.castArm?1:.12):1,zk=c.inspector?.3:.48;A.rotation.x=(th+(-1.4-th)*q*qk)+.12*(G.gait?G.gait.arm/.12:1)*Math.sin(c.phase*(G.gait?G.gait.cad:1)+i*Math.PI-(G.gait?G.gait.lag||0:0))*c.amp+.03*Math.sin(t*1.3+i);A.rotation.z=s*(rz0-zk*q*qk)}   // 腕は2本（魔法人）か4本（調査員。魔法を撃つ1本だけを前へ上げ、ほかの腕はほとんど動かさない）
  if(c.soldier&&G.swH){const P=c.sPose,kL=Math.max(0,Math.min(1,(-P[0]-1)/1.7));   // 軍人: 右腕と巨大な剣の角度を決める。左腕は振りかぶる時に少し上がってバランスを取る
    G.arms[0].rotation.x=P[0]+.03*Math.sin(t*1.6)+.08*Math.sin(c.phase)*c.amp;G.swH.rotation.x=Math.PI+P[1];G.arms[0].rotation.y=P[3];G.swB.rotation.y=Math.PI/2*(1-P[4]);   // 横なぎは腕を左右に振り、刃を横に寝かせる(縦=縁が前後 / 横=縁が左右)
    
    if(c.gkQuad&&G.swH3&&G.swH4){const Q=c.q2Act?c.sPose2:c.sPose,yo=-QD.YAW;   // 四刀流: 下の2本（腕2・3）。上の2本より外へ少し開く。左は右を左右反転
      G.arms[2].rotation.x=Q[0]+.03*Math.sin(t*1.6+2);G.swH3.rotation.x=Math.PI+Q[1];G.arms[2].rotation.y=Q[3]+yo;G.swB3.rotation.y=Math.PI/2*(1-Q[4]);
      G.arms[3].rotation.x=Q[0]+.03*Math.sin(t*1.6+3);G.swH4.rotation.x=Math.PI+Q[1];G.arms[3].rotation.y=-(Q[3]+yo);G.swB4.rotation.y=Math.PI/2*(1-Q[4])}
    if((c.gkDual||c.gkQuad)&&G.swH2){G.arms[1].rotation.x=P[0]+.03*Math.sin(t*1.6+1)+.08*Math.sin(c.phase+Math.PI)*c.amp;G.swH2.rotation.x=Math.PI+P[1];G.arms[1].rotation.y=-P[3];G.swB2.rotation.y=Math.PI/2*(1-P[4])}   // 双剣: 左手の剣は右手の姿勢を左右反転して動かす（左右の振り・刃の寝かせ具合）
    else G.arms[1].rotation.x=th-.9*kL+.12*Math.sin(c.phase+Math.PI)*c.amp}
  if(G.legs){const GT=G.gait,ph=c.phase*(GT?GT.cad:1),am=Math.min(1,c.amp||0);for(let i=0;i<2;i++){const lg=G.legs[i],sw=Math.sin(ph+i*Math.PI),sd=i?1:-1;lg.rotation.x=-(GT?GT.sw:.7)*sw*am+(G.pose?G.pose.hip:0);lg.userData.kn.rotation.x=(GT?Math.max(0,Math.cos(ph+i*Math.PI)):Math.max(0,sw))*(GT?GT.kn:.95)*am+(G.pose?G.pose.knee:0);if(lg.userData.ft)lg.userData.ft.rotation.x=-(G.leanNode.rotation.x+lg.rotation.x+lg.userData.kn.rotation.x);if(GT){lg.rotation.z=sd*(GT.out+.04*Math.max(0,sw)*am);lg.rotation.y=sd*GT.toe;if(GT.kz)lg.userData.kn.rotation.z=-lg.rotation.z*GT.kz}}}   // 足の動き: 体格ごとの歩き方(G.gait)。bulky=足を広げてのしのし / lanky=足を近づけてゆっくり大股   // 足があるタイプ: 歩く時に左右の足を交互に振り、後ろへ戻る足はひざを曲げる
  c.upQ=(c.upQ||0)+(((c.spT>=0&&!c.fl&&!c.fz)?1:0)-(c.upQ||0))*Math.min(1,dt*((c.spT>=0&&!c.fl&&!c.fz)?6:12));   // 追加属性の攻撃の間は、両手（すべての腕）を頭上へ挙げる。飛ばしたら下ろす
  if(c.upQ>.01&&!c.gkStyle)for(const A of G.arms)A.rotation.x+=(-2.9-A.rotation.x)*c.upQ;
  if(c.gkStyle)gkStylePose(c,dt,q);if(c.gkGreat)gkTwoHand(c);gkShieldStep(c,G,dt);   // ③ 素手: 手を広げる / 杖: 振り上げて振り下ろす（剣は軍人の姿勢のまま、剣を掲げる）
  G.head.position.y=G.headY+.04*Math.sin(t*1.9);G.head.rotation.y=.25*Math.sin(t*.8);G.head.rotation.x+=((stg?.6:0)-G.head.rotation.x)*Math.min(1,dt*6);G.eyes.visible=!stg||Math.sin(t*28)>-.2;   // 崩れている間は、頭が垂れて目がちらつく   // 頭はふわふわ浮く
  if(c.fzLift){c.fzLift+=((c.fz?c.fzLiftT:0)-c.fzLift)*Math.min(1,dt*8);if(!c.fz&&c.fzLift<.02)c.fzLift=0}   // 闇の乱舞で飛んでいる間は体が浮く
  c.g.position.set(c.x,c.y+(c.jy||0)+(c.fzLift||0),c.z);c.g.rotation.y=c.yaw-PEASANT_FLIP;if(c.fl)gkFlipApply(c);if(c.dr)gkDrillApply(c);
  if(c.soldier&&c.gk&&c.gkFirst)soldierGkFx(c,dt);   // 軍人ゲートキーパー: 剣の刃の色を属性色へ寄せる（オーラは出さない）
  if(c.gk)gkMeltStep(c,dt);   // 回転・ジャンプ・素早い移動の間は、体が溶けて属性と一体化する（残像・粒）
  if(c.gk)gkMagicAura(c,dt);   // 全タイプ共通: 魔法を使っている最中だけ、その属性のオーラ（属性が二つなら二つ）
  if(c.soldier&&c.swElem)soldierFx(c,dt);
  return false;
}
const MCOUNT={TYPES:['fire','thunder'],ARM:[1,2,3]};   // TYPES=魔法人の相殺の魔法 / ARM=調査員の相殺に使う腕（氷の腕は相殺できないので使わない）。相殺の間隔・距離の制限はない（敵対していて、魔法を構えている最中でなければ、撃つたびに返す。相殺のビームは一瞬で届く）
function mageCounter(M){                                          // プレイヤーが魔法を撃った: 敵対している（敵対する前の攻撃は受ける）魔法人・調査員のうち、魔法を構えている最中でない者が、自分の魔法でぶつけて相殺する。間隔・距離の制限なし
  if(STAT.dead)return;   // 相殺できるのは 闇・支配・操作・爆破・創造 だけ（magicClashTick が絞る）。魔法人もそれを弾く
  for(const c of creatures){
    if(!c.mage||c.soldier||c.gk||c.hp<=0||c.dead!==undefined||!c.hostile||c.frozen>0||(c.inspector?holdingCharge(c):c.bT>=0))continue;   // 調査員は、自分の魔法が光ってから撃つまでの間（＝プレイヤーが相殺するタイミング）以外はいつでも相殺する（構えている最中も）。魔法人は構えている最中は相殺しない
    if(M.o)M.o.parried=true;   // 相殺で返された
    const sv={sp:c.spell,arm:c.castArm,aim:c.aim,go:c.golemO};   // 構えの最中に相殺した時、元の魔法・狙いを壊さないよう保存
    if(c.inspector){c.castArm=MCOUNT.ARM[Math.floor(Math.random()*MCOUNT.ARM.length)];c.spell=INSP_ELEM[c.castArm]}else c.spell=MCOUNT.TYPES[Math.floor(Math.random()*MCOUNT.TYPES.length)];
    const hand=chargePos(c),u=new THREE.Vector3(hand.x-M.O.x,hand.y-M.O.y,hand.z-M.O.z),sP=Math.max(0,Math.min(M.L,u.dot(M.A))),T=M.O.clone().addScaledVector(M.A,sP*.55);   // ぶつける所: プレイヤーのビームのうち、魔法人に近い側の途中
    c.aim={x:T.x,y:T.y,z:T.z};c.golemO=hand;c.counter=true;
    enemyFlash(hand,c.spell,c.size||1);castEnemyMagic(c);c.counter=false;
    if(c.bT>=0){c.spell=sv.sp;c.castArm=sv.arm;c.aim=sv.aim;c.golemO=sv.go}
    c.cnT=.5;
  }
}
