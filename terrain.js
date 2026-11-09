/* terrain.js — 地形の生成（index.html から分離）。
   index.html の <script src="terrain.js"> で読み込まれる。このファイルが無いと index.html は何もない平面になる。
   installA = ノイズ・気候・大陸・山・川・街・村・城・各種集落・地形の高さ(heightAt)
   installB = 植生・宮殿・遺跡・汚染(火/氷/雷/闇)・ランドマーク・チャンク生成(makeChunk)
   中のコードは index.html から切り出したままで、index.html 側の関数・定数もそのまま使う。 */
window.TerrainGen={
 installA:function(){
function fbm(x,y){let s=0,a=.5,f=1;for(let i=0;i<5;i++){s+=a*vnoise(x*f,y*f);f*=2;a*=.5}return s}
// 街: ワールドを TCELL(m) 四方のセルに分け、セルごとに70%で1つ、ランダムな位置・大きさ(半径500〜850m=直径1〜1.7km)・形の巨大な街ができる
// スポーン地点とは無関係に決まる（スポーンは街の外）。街同士が重ならないよう、中心のずれ幅はセルの30%まで。
const GEN_OTHER_TOWNS=false;   // 砂漠の街以外（川沿いの村・港町・西洋の都市・屋敷・教会・修道院・帝国）の生成。false=生成しない（コードとデータはそのまま残してある）。true にすると元に戻る
const townCache=new Map();
function rectNear(ix,iz,C,x,z,reach){const dx=Math.max(ix*C-x,0,x-(ix+1)*C),dz=Math.max(iz*C-z,0,z-(iz+1)*C);return dx*dx+dz*dz<=reach*reach}   // 区画(ix,iz,1辺C)の矩形が(x,z)からreach以内か: 表示に関係ない遠い区画は街・拠点を生成しない
// 政体ラベル: 宮殿/城 > 屋敷 > なし。構造物の有無から毎回判定し、今後生成される集落にも適用する。
const KINGDOM_ATTACHED_CITY=false;   // true にすると砂漠の王国に市場都市が併設されることがある。false=併設しない
const TOWN_OUTER_BAILEY=false;   // true にすると外壁の外にもう一つの低い壁（外郭）を作る。false=作らない（外壁が二重に見えるため）
function roadClip(t,cx,cz,ex,ez,strict){                       // 橋の下の通路・傾斜路の敷地・(strict)橋の真下に、置いてはいけない物がかかるか
  for(const q of t.roads){
    const zr=q.ax==='z',pp=zr?cx:cz,pe=zr?ex:ez,al=zr?cz:cx,ae=zr?ez:ex,off=Math.abs(pp-q.c)-pe,m=q.sg*(al-(zr?t.z:t.x)),a=m-ae,b=m+ae;
    if(b>q.sf&&a<q.s1&&off<(strict?RW/2+2:TUN/2))return true;
    if(b>q.s0-8&&a<q.sf&&off<RW/2+2)return true;
  }
  return false;
}
function underDeck(t,cx,cz,ex,ez){                              // 橋桁（平らな部分）の真下にかかるか
  for(const q of t.roads){
    const zr=q.ax==='z',pp=zr?cx:cz,pe=zr?ex:ez,al=zr?cz:cx,ae=zr?ez:ex,m=q.sg*(al-(zr?t.z:t.x));
    if(m+ae>q.sf&&m-ae<q.s1&&Math.abs(pp-q.c)-pe<RW/2+1.2)return true;
  }
  return false;
}
function deckInfo(x,z){                                         // 橋の上面の高さ(TOWN_Hからの高さ)。傾斜路ならramp=true。橋は外壁の門楼の外側の面で終わる
  for(const t of nearTowns(x,z))for(const q of t.roads){
    const zr=q.ax==='z',pp=zr?x:z;
    if(Math.abs(pp-q.c)>=RW/2)continue;
    const s=q.sg*((zr?z:x)-(zr?t.z:t.x));
    if(s<q.s0||s>q.s1)continue;
    return{h:DH,ramp:false,zr,c:q.c,s,s1:q.s1,ctr:zr?t.z:t.x,sg:q.sg};
  }
  return null;
}
function palW(p,u,v){const c=Math.cos(p.th),s=Math.sin(p.th);u*=p.k;v*=p.k;return [p.x+u*c+v*s,p.z-u*s+v*c]}   // 宮殿の局所座標(u=横,v=正面方向)→ワールド（k倍）
function palL(p,x,z){const c=Math.cos(p.th),s=Math.sin(p.th),dx=x-p.x,dz=z-p.z;return [(dx*c-dz*s)/p.k,(dx*s+dz*c)/p.k]}
function palRect(p,u,v,w,d,h,m){const[x,z]=palW(p,u,v),sw=Math.abs(Math.sin(p.th))>.5,k=p.k;return{x,z,w:(sw?d:w)*k,d:(sw?w:d)*k,top:TOWN_H+DH+h*k,m:m===undefined?.3:m}}
const HALL_TIERS=[2,5];                                          // 本殿の段数の範囲（最小,最大）。街ごとにこの範囲でランダム
function makePalace(t,fx,fz,k){                                   // 宮殿（局所座標 u=横, v=正面(+)）: 奥に本殿(1)、その左右にすき間なく続く建物(2)、手前に広場(3)を囲むU字の建物。全体が u=0 の軸で左右対称
  const p={x:t.x,z:t.z,th:Math.atan2(fx,fz),k,rects:[],circs:[],bx:[],roofs:[],dc:[],wings:[],arcs:[]};
  const r=mulberry(hash(Math.round(t.x),Math.round(t.z),SEED+55)*1e9|0),T=1.2,DR=9;
  const R=(u,v,w,d,h,m)=>p.rects.push(palRect(p,u,v,w,d,h,m));
  const blk=(u,v,w,d,y0,y1)=>{p.bx.push([u,v,w,d,y0,y1]);if(!y0)R(u,v,w,d,y1)};
  const W=(u0,u1,v0,v1,h)=>({u0,u1,v0,v1,h,skip:{},doors:{l:[],r:[],f:[],b:[]}});
  const sdome=(x,y,z,s)=>p.dc.push(['D',x,y+.8,z,s,1.8*s],['M',x,y+.8+1.8*s,z,1.18*s,1.45*s],['F',x,y+.8+1.8*s+1.45*s,z,.36*s]);   // 小ドーム（y=屋根の下面の高さ）
  // ① 本殿: 奥(v=-55)に接して置く、n段の階段状の塔。各段は壁で囲み、屋根は縁の輪だけ（中央はあけて）、全段ぶち抜きの吹き抜け
  const hw=56+r()*10,hd=34+r()*6,n=HALL_TIERS[0]+Math.floor(r()*(HALL_TIERS[1]-HALL_TIERS[0]+1)),VB=-55,vc=VB+hd/2;p.hv=vc;   // p.hv=本殿の中心のv（デバッグのワープ用）
  const h0=17+r()*3,th=8.5+r()*2.5,inset=Math.min(5,(Math.min(hw,hd)/2-7)/(n-1));
  const tiers=[];for(let i=0;i<n;i++){const y0=i?h0+(i-1)*th:0;tiers.push({w:hw-2*inset*i,d:hd-2*inset*i,y0,y1:i?y0+th:h0})}
  const hall=W(-hw/2,hw/2,VB,VB+hd,h0),all=[hall],H=tiers[n-1].y1;
  hall.doors.f.push([0,10]);hall.noArcs=true;
  // ② 本殿の左右にすき間なく続く建物（本殿との境の壁に扉）
  const w2=20+r()*3,d2=hd*.8,h2=11+r()*5,dome2=r()<.5;
  for(const sd of[-1,1]){
    const a=sd*hw/2,b=sd*(hw/2+w2),wg=W(Math.min(a,b),Math.max(a,b),VB,VB+d2,h2);
    wg.skip[sd>0?'l':'r']=true;wg.dome=dome2;hall.doors[sd>0?'r':'l'].push([VB+d2/2,6]);all.push(wg);
  }
  // ③ 広場を囲むU字の建物: 本殿の手前に横長の棟、その両端から手前へ脚が伸びる。扉は 本殿→横長の棟→広場
  const bh=10+r()*3,b0=hall.v1,b1=b0+18,LEG=42,mid=(PLAZA+BAR_W)/2;
  const bar=W(-BAR_W,BAR_W,b0,b1,bh);bar.doors.b.push([0,10]);bar.doors.f.push([-mid,6],[0,10],[mid,6]);bar.arcRange=[-PLAZA,PLAZA];all.push(bar);
  for(const sd of[-1,1]){const a=sd*PLAZA,b=sd*BAR_W,leg=W(Math.min(a,b),Math.max(a,b),b1,b1+LEG,bh-.5);leg.skip.b=true;all.push(leg)}
  for(const wg of all){                                             // 壁（扉の上は楣）・窓・屋根
    const{u0,u1,v0,v1,h}=wg,uc=(u0+u1)/2,vcw=(v0+v1)/2,w=u1-u0,d=v1-v0;
    const wall=(sideKey,fixed,a0,a1,alongU)=>{
      if(wg.skip[sideKey])return;const ds=wg.doors[sideKey].slice().sort((a,b)=>a[0]-b[0]);let cur=a0;
      const put=(x0,x1,y0,y1)=>{if(x1-x0>.01)alongU?blk((x0+x1)/2,fixed,x1-x0,T,y0,y1):blk(fixed,(x0+x1)/2,T,x1-x0,y0,y1)};
      for(const[c,dw] of ds){put(cur,c-dw/2,0,h);put(c-dw/2,c+dw/2,DR,h);cur=c+dw/2}put(cur,a1,0,h);
    };
    const sa=wg.skip.b?v0:v0+T,sb=wg.skip.f?v1:v1-T;                  // 脚は奥の壁を持たない（横長の棟の壁と一続き）ので、側壁を奥の端まで伸ばす
    wall('f',v1-T/2,u0,u1,true);wall('b',v0+T/2,u0,u1,true);wall('l',u0+T/2,sa,sb,false);wall('r',u1-T/2,sa,sb,false);
    p.wings.push([uc,vcw,w,d]);
    if(wg!==hall){
      p.roofs.push([uc,vcw,w,d,h,1]);if(wg.dome){const R2=Math.min(w,d)*.28;p.dc.push(['D',uc,h+.8,vcw,R2*.8,3],['M',uc,h+3.8,vcw,R2,R2*1.1])}
    }
  }
  // ④ 本殿の2段目以上の壁と、各段の屋根（縁だけの輪。中央は吹き抜け）、最上段の天井と大ドーム
  for(let i=0;i<n;i++){
    const a=tiers[i],b=tiers[i+1];
    if(i>0){const y0=a.y0+.4,y1=a.y1;                               // 壁（前の段の屋根の板に少し埋める）
      blk(0,vc+a.d/2-T/2,a.w,T,y0,y1);blk(0,vc-a.d/2+T/2,a.w,T,y0,y1);
      blk(a.w/2-T/2,vc,T,a.d-2*T,y0,y1);blk(-a.w/2+T/2,vc,T,a.d-2*T,y0,y1);
    }
    if(b){const h=a.y1,ow=a.w+.8,od=a.d+.8,iw=b.w-2*T-.2,id=b.d-2*T-.2;   // 輪の屋根（外は軒、内は上の段の壁の下まで）
      blk(0,vc+(od+id)/4,ow,(od-id)/2,h,h+.8);blk(0,vc-(od+id)/4,ow,(od-id)/2,h,h+.8);
      blk((ow+iw)/4,vc,(ow-iw)/2,id,h,h+.8);blk(-(ow+iw)/4,vc,(ow-iw)/2,id,h,h+.8);
      const s=Math.min(2.2,inset*.42),cx=a.w/2-inset/2,cz=a.d/2-inset/2;
      for(const sx of[-1,1])for(const sz of[-1,1])sdome(sx*cx,h,vc+sz*cz,s);
    }else{
      p.roofs.push([0,vc,a.w,a.d,H,1]);
      const D=Math.min(11,Math.max(4.5,Math.min(a.w,a.d)*.32));     // 最上段の天井と大ドーム（大きさは最上段に合わせる）
      p.dc.push(['D',0,H+.8,vc,D,D*.667],['M',0,H+.8+D*.667,vc,D*1.044,D*1.28],['F',0,H+.8+D*.667+D*1.28,vc,D*.18]);
      for(const sx of[-1,1])for(const sz of[-1,1])sdome(sx*(a.w/2-3.2),H,vc+sz*(a.d/2-3.2),2.2);
    }
  }
  // ⑤ 装飾: 軒の蛇腹・土台・窓枠・扉枠・胸壁・柱・窓の凹み。箱(p.tb)と円柱(p.tc)は描画側でまとめて描く
  const TB=p.tb=[],TC=p.tc=[],ROT={f:0,b:Math.PI,r:Math.PI/2,l:-Math.PI/2};
  const tb=(u,y,v,sx,sy,sz)=>TB.push([u,y,v,sx,sy,sz]),tc=(u,y,v,r,h)=>TC.push([u,y,v,r,h]);
  // 壁の1面に飾る。n=面の向き(f=+v,b=-v,r=+u,l=-u。室内側の面は内向きの法線)、pc=面の位置、[a0,a1]=面に沿った範囲、ylo〜yhi=高さ
  const face=(n,pc,a0,a1,ylo,yhi,o={})=>{
    const al=n==='f'||n==='b',sg=(n==='f'||n==='r')?1:-1,P=(a,q)=>al?[a,q]:[q,a],len=a1-a0,gaps=o.gaps||[];
    const bx=(a,l,y,hh,out)=>{const[u,v]=P(a,pc+sg*out/2);al?tb(u,y+hh/2,v,l,hh,out):tb(u,y+hh/2,v,out,hh,l)};
    const free=(a,hw)=>!gaps.some(g=>Math.abs(a-g[0])<g[1]/2+hw);
    if(o.cornice!==false){bx((a0+a1)/2,len+.2,yhi-1.9,.45,.4);bx((a0+a1)/2,len+.2,yhi-1.45,.45,.6)}   // 軒の下の蛇腹（二段）
    if(o.plinth){let cur=a0;for(const g of gaps.slice().sort((x,y)=>x[0]-y[0])){const e=g[0]-g[1]/2-.3;if(e>cur+.1)bx((cur+e)/2,e-cur,ylo,1,.45);cur=Math.max(cur,g[0]+g[1]/2+.3)}if(a1>cur+.1)bx((cur+a1)/2,a1-cur,ylo,1,.45)}   // 土台（扉の所は切る）
    const nb=Math.max(1,Math.floor(len/6)),bl=len/nb;
    for(const w of o.win||[]){for(let i=0;i<nb;i++){                       // 窓: 暗い尖頭アーチの凹み＋枠（両脇の柱・上の楣・下の窓台）
      const a=a0+(i+.5)*bl;if(!free(a,w.sx/2+1))continue;
      const[u,v]=P(a,pc+sg*.05);p.arcs.push([u,w.y,v,w.sx,w.sy,ROT[n]]);
      for(const s2 of[-1,1])bx(a+s2*(w.sx/2+.35),.55,w.y-.3,w.sy+.8,.35);
      bx(a,w.sx+1.5,w.y+w.sy+.05,.45,.5);bx(a,w.sx+1.2,w.y-.35,.35,.55);
    }}
    if(o.cols)for(let i=0;i<=nb;i++){const a=a0+i*bl;if(!free(a,.9))continue;   // 壁付きの柱（土台・柱身・柱頭）
      const y0=ylo+(o.plinth?1:0),y1=yhi-2,[u,v]=P(a,pc+sg*.33);tc(u,(y0+y1)/2,v,.55,y1-y0);bx(a,1.4,y0,.6,1.05);bx(a,1.4,y1-.6,.6,1.05)}
    for(const[a,w] of o.doors||[]){for(const s2 of[-1,1])bx(a+s2*(w/2+.35),.7,0,DR+.9,.6);bx(a,w+1.9,DR,.9,.6)}   // 扉枠
    if(o.parapet){const nm=Math.max(1,Math.floor(len/2.6)),ml=len/nm;for(let i=0;i<nm;i++){const[u,v]=P(a0+(i+.5)*ml,pc-sg*.2);al?tb(u,yhi+1.35,v,1.5,1.1,.8):tb(u,yhi+1.35,v,.8,1.1,1.5)}}   // 屋根の縁の胸壁
  };
  const WG=(y,sx,sy)=>({y,sx,sy}),tall=[WG(1.6,2,5.2),WG(9,1.7,4.2)],low=[WG(1.5,1.9,5)],ext={cols:1,plinth:1,parapet:1};
  // 外側: 本殿1段目（奥・左右の露出部・手前の棟より上）
  face('b',VB,-hw/2,hw/2,0,h0,{...ext,win:tall});
  for(const sd of[-1,1])face(sd>0?'r':'l',sd*hw/2,VB+d2+.4,hall.v1,0,h0,{...ext,win:tall});
  {const y=bh+1.9,sy=h0-2.6-y;face('f',hall.v1,-hw/2,hw/2,bh+1.2,h0,{parapet:1,win:sy>=2.2?[WG(y,1.7,sy)]:[]})}
  // 外側: 本殿の左右の建物(2)
  for(const sd of[-1,1]){const lo=sd>0?hw/2:-(hw/2+w2),hi=sd>0?hw/2+w2:-hw/2,vf=VB+d2;
    face('f',vf,lo,hi,0,h2,{...ext,win:low});face('b',VB,lo,hi,0,h2,{...ext,win:low});face(sd>0?'r':'l',sd*(hw/2+w2),VB,vf,0,h2,{...ext,win:low})}
  // 外側: 広場に面した横長の棟（正面の扉に枠）・U字の脚
  face('f',b1,-PLAZA,PLAZA,0,bh,{...ext,win:low,gaps:[[0,10]],doors:[[0,10]]});
  for(const sd of[-1,1]){const lh=bh-.5;
    face(sd>0?'r':'l',sd*BAR_W,b0,b1,0,bh,{...ext,win:low});face('b',b0,sd>0?hw/2:-BAR_W,sd>0?BAR_W:-hw/2,0,bh,{...ext,win:low});
    face(sd>0?'r':'l',sd*BAR_W,b1,b1+LEG,0,lh,{...ext,win:low});face(sd>0?'l':'r',sd*PLAZA,b1,b1+LEG,0,lh,{...ext,win:low});   // 脚の外側・広場側
    face('f',b1+LEG,sd>0?PLAZA:-BAR_W,sd>0?BAR_W:-PLAZA,0,lh,{...ext,win:low})}
  // 横長の棟の前の列柱（屋根つきの回廊。中央は扉の前をあける）
  {const pv=b1+3.4,top=DR+.3;
    for(const sd of[-1,1])for(let j=0;j<5;j++){const x=sd*(7.4+4.2*j),[wx,wz]=palW(p,x,pv);
      tc(x,top/2,pv,.6,top);tb(x,.3,pv,1.5,.6,1.5);tb(x,top-.3,pv,1.5,.6,1.5);p.circs.push([wx,wz,.6*k,TOWN_H+DH+top*k])}
    tb(0,top-.25,pv,2*PLAZA,.5,.9);tb(0,top+.35,b1+1.95,2*PLAZA,.7,3.9);tb(0,top+.35,b1+3.9,2*PLAZA,.9,.5)}   // 梁・屋根の板・前縁
  // 室内（吹き抜けの壁）: 1段目の内壁と、2段目以上の内壁・外壁
  {const ih={cols:1,plinth:1,win:tall},iw=hw/2-T,gs=[[VB+d2/2,6]];
    face('b',hall.v1-T,-iw,iw,0,h0,{...ih,gaps:[[0,10]]});face('f',VB+T,-iw,iw,0,h0,ih);
    face('l',iw,VB+T,hall.v1-T,0,h0,{...ih,gaps:gs});face('r',-iw,VB+T,hall.v1-T,0,h0,{...ih,gaps:gs})}
  for(let i=1;i<n;i++){const a=tiers[i],iw=a.w/2-T,id=a.d/2-T,yb=a.y0+.8,wi=[WG(a.y0+2.2,1.8,3.6)],wo=[WG(a.y0+2.3,1.8,3.4)];
    for(const[nn,pcv,r0,r1] of[['b',vc+id,-iw,iw],['f',vc-id,-iw,iw],['l',iw,vc-id,vc+id],['r',-iw,vc-id,vc+id]])face(nn,pcv,r0,r1,yb,a.y1,{cols:1,win:wi});
    for(const[nn,pcv,r0,r1] of[['f',vc+a.d/2,-a.w/2,a.w/2],['b',vc-a.d/2,-a.w/2,a.w/2],['r',a.w/2,vc-a.d/2,vc+a.d/2],['l',-a.w/2,vc-a.d/2,vc+a.d/2]])face(nn,pcv,r0,r1,yb,a.y1,{...ext,win:wo})}
  return p;
}
// 壁: 外壁・内壁・宮殿の城壁を6mの小片に分け、チャンクごとに束ねる（小片=[x,z,長さ,厚さ,高さ,回転]、ミナレット=[x,z,高さ]）。門の所は小片を作らない。
function buildWalls(t){
  const HS=t.HS,B=new Map();
  const bk=(x,z)=>{const key=Math.floor(x/CHUNK)+','+Math.floor(z/CHUNK);let b=B.get(key);if(!b){b={w:[],m:[],t:[]};B.set(key,b)}return b};
  // 門の開口: 壁の小片の中心で省くと、開口の幅が小片の位置しだいで広がったり狭まったり（道や橋をふさぐ・塔との間に隙間）するので、小片を開口の端（門塔の内側の面）でぴったり切る
  const gateAxis=(x,z,len,open)=>{const dx=x-t.x,dz=z-t.z,ad=Math.abs(dx),az=Math.abs(dz);
    if(az>ad&&ad<open+len)return townGateOpen(t,dz>=0?Math.PI/2:-Math.PI/2)?'z':null;
    if(ad>=az&&az<open+len)return townGateOpen(t,dx>=0?0:Math.PI)?'x':null;return null};
  const wallClip=(x,z,len,rot,open,cb)=>{
    const ax=gateAxis(x,z,len,open);if(!ax){cb(x,z,len);return}
    const ph=-rot,cx=Math.cos(ph),sx=Math.sin(ph),u0=ax==='z'?x-t.x:z-t.z,k=ax==='z'?cx:sx;
    if(Math.abs(k)<.2){if(Math.abs(u0)>=open)cb(x,z,len);return}
    const sa=(-open-u0)/k,sb=(open-u0)/k,s0=Math.min(sa,sb),s1=Math.max(sa,sb),h=len/2;
    const seg=(a,b)=>{if(b-a>.3)cb(x+(a+b)/2*cx,z+(a+b)/2*sx,b-a)};
    seg(-h,Math.min(s0,h));seg(Math.max(s1,-h),h);
  };
  if(t.kind==='city'){
    // 都市は王国の外壁と同様の石壁・水堀を持つが、内壁や宮殿の壁は作らない。
    const wallR=a=>townEdge(t,a)-5,gateHalf=8;let idx=0;
    for(let a=0;a<Math.PI*2;){
      const r1=wallR(a),a2=a+6/r1,r2=wallR(a2),mx=t.x+(Math.cos(a)*r1+Math.cos(a2)*r2)/2,mz=t.z+(Math.sin(a)*r1+Math.sin(a2)*r2)/2;
      const dx=mx-t.x,dz=mz-t.z,ang=Math.atan2(dz,dx),rad=Math.hypot(dx,dz);
      const cl=Math.hypot((Math.cos(a2)*r2)-(Math.cos(a)*r1),(Math.sin(a2)*r2)-(Math.sin(a)*r1))+.5,crot=-Math.atan2(Math.sin(a2)*r2-Math.sin(a)*r1,Math.cos(a2)*r2-Math.cos(a)*r1);
      wallClip(mx,mz,cl,crot,7.5,(px,pz,l)=>bk(px,pz).w.push([px,pz,l,8,13,crot,undefined,(idx++)%3]));   // 門塔（10m脇・5m角）の内側の面(7.5m)まで開ける
      a=a2;
    }
    // 四方の門の両脇に低い門塔。門の開口は橋から広場へ続く道と一直線。
    for(const a of[0,Math.PI/2,Math.PI,Math.PI*1.5]){
      if(!townGateOpen(t,a))continue;
      const r=wallR(a),tx=t.x+Math.cos(a)*r,tz=t.z+Math.sin(a)*r;
      for(const side of[-1,1]){const x=tx-Math.sin(a)*side*10,z=tz+Math.cos(a)*side*10;bk(x,z).w.push([x,z,5,5,14,0]);}
    }
    t.wallB=B;return;
  }
  const gate=(x,z,gw)=>{const dx=Math.abs(x-t.x),dz=Math.abs(z-t.z);
    if(dx<gw&&dz>HS-8)return townGateOpen(t,z>=t.z?Math.PI/2:-Math.PI/2);
    if(dz<gw&&dx>HS-8)return townGateOpen(t,x>=t.x?0:Math.PI);return false};
  let jn=0;                                                                       // 隣り合う小片の高さ・厚みを少しずらす（重なり部分で面が重なってチラつくのを防ぐ）
  const piece=(x,z,len,th,h,rot,gw)=>{wallClip(x,z,len,rot,TOWER_OFF-3,(px,pz,l)=>bk(px,pz).w.push([px,pz,l,th,h,rot,undefined,(jn++)%3]))};   // 門塔（9.6m脇・6m角）の内側の面(6.6m)まで開ける
  const ring=(fr,h,th,gw,hn,bg,opt)=>{
    let idx=0;
    for(let a=0;a<Math.PI*2;){
      const r1=fr(a),a2=a+6/r1,r2=fr(a2);
      const x1=t.x+Math.cos(a)*r1,z1=t.z+Math.sin(a)*r1,x2=t.x+Math.cos(a2)*r2,z2=t.z+Math.sin(a2)*r2;
      {const mx=(x1+x2)/2,mz=(z1+z2)/2,dx=Math.abs(mx-t.x),dz=Math.abs(mz-t.z),near=hn!==undefined&&((dx<16&&dz>HS-8)||(dz<16&&dx>HS-8));
      piece(mx,mz,Math.hypot(x2-x1,z2-z1)+.4,th,near?hn:h,-Math.atan2(z2-z1,x2-x1),gw);
      if(!opt&&idx++%5===2&&!((dx<bg&&dz>HS-8)||(dz<bg&&dx>HS-8))){const L=Math.hypot(mx-t.x,mz-t.z),bx=mx+(mx-t.x)/L*th/2,bz=mz+(mz-t.z)/L*th/2;bk(bx,bz).t.push([bx,bz,th*.55,h+3])}}   // 約30mおきに壁の外側へ半円の張り出し（半円塔）
      a=a2;
    }
    for(let q=0;q<4;q++){                                                           // 門の両脇の門塔
      const a=q*Math.PI/2,r=fr(a);
      for(const sg of[-1,1]){const to=opt?opt.toff:TOWER_OFF,x=t.x+Math.cos(a)*r-Math.sin(a)*sg*to,z=t.z+Math.sin(a)*r+Math.cos(a)*sg*to;bk(x,z).w.push([x,z,opt?opt.tw:6,opt?opt.tw:6,opt?opt.tH:15,0])}
    }
  };
  ring(a=>townEdge(t,a)-5,16,10,RGATE,undefined,30);                                                     // 外壁
  ring(a=>townEdge(t,a)*INNER_K,14,8,RGATE,9,20);
  if(TOWN_OUTER_BAILEY)ring(a=>townEdge(t,a)+37,7,4,8.2,undefined,undefined,{toff:7.9,tw:5,tH:10});             // 外郭: 外壁の外に、もう一つの低い壁（門の前は道の幅だけ開ける）                                               // 内壁
  {                                                                                  // 宮殿の四角い城壁: 門の開口(|s|<6.15)は下の土台で埋め、その外側を左右対称にすき間なく並べる（南北の壁は角の外面まで、東西の壁は角の内面まで）
    const hasRd=ang=>t.roads.some(q=>Math.abs(Math.atan2(Math.sin(q.ang-ang),Math.cos(q.ang-ang)))<.1);   // その方角に主要な道（橋）があるか。無い側は門を開けず壁で閉じる
    const g0=6.15,seg=(e,cb)=>{const n=Math.max(1,Math.ceil((e-g0)/6)),pl=(e-g0)/n;for(const sd of[-1,1])for(let k=0;k<n;k++)cb(sd*(g0+pl*(k+.5)),pl+(k?.2:.1),(jn++)%3)};
    seg(HS+1.5,(c,l,j)=>{for(const sg of[-1,1])bk(t.x+c,t.z+sg*HS).w.push([t.x+c,t.z+sg*HS,l,3,14+DH,0,undefined,j])});
    seg(HS-1.5,(c,l,j)=>{for(const sg of[-1,1])bk(t.x+sg*HS,t.z+c).w.push([t.x+sg*HS,t.z+c,l,3,14+DH,Math.PI/2,undefined,j])});
    for(const sg of[-1,1]){                                                          // 橋のない側の門の開口は壁でふさぐ
      if(!hasRd(sg>0?Math.PI/2:-Math.PI/2))bk(t.x,t.z+sg*HS).w.push([t.x,t.z+sg*HS,2*g0+.4,3,14+DH,0,undefined,(jn++)%3]);
      if(!hasRd(sg>0?0:Math.PI))bk(t.x+sg*HS,t.z).w.push([t.x+sg*HS,t.z,2*g0+.4,3,14+DH,Math.PI/2,undefined,(jn++)%3]);
    }
  }
  const hasRd2=ang=>t.roads.some(q=>Math.abs(Math.atan2(Math.sin(q.ang-ang),Math.cos(q.ang-ang)))<.1);
  for(const sg of[-1,1])for(const u of[-3.05,3.05]){                                // 宮殿の門の隙間: 橋の高さまでの土台（橋はこの上から宮殿へ入る）
    if(hasRd2(sg>0?Math.PI/2:-Math.PI/2))bk(t.x+u,t.z+sg*HS).w.push([t.x+u,t.z+sg*HS,6.3,3.25,DH,0,true]);
    if(hasRd2(sg>0?0:Math.PI))bk(t.x+sg*HS,t.z+u).w.push([t.x+sg*HS,t.z+u,6.3,3.25,DH,Math.PI/2,true]);
  }
  for(const sx of[-1,1])for(const sz of[-1,1])bk(t.x+sx*HS,t.z+sz*HS).m.push([t.x+sx*HS,t.z+sz*HS,36+DH]);   // 四隅のミナレット
  for(const sg of[-1,1])for(const e of[-1,1]){                                      // 門の両脇のミナレット
    if(hasRd2(e>0?Math.PI/2:-Math.PI/2))bk(t.x+sg*(GW+3),t.z+e*HS).m.push([t.x+sg*(GW+3),t.z+e*HS,26+DH]);
    if(hasRd2(e>0?0:Math.PI))bk(t.x+e*HS,t.z+sg*(GW+3)).m.push([t.x+e*HS,t.z+sg*(GW+3),26+DH]);
  }
  {                                                                                  // 宮殿を囲む追加の壁（青）: 宮殿の向きに合わせた四角。正面の中央だけ門にして、両脇にミナレット
    const p=t.pal,K=p.k,sw=Math.abs(Math.sin(p.th))>.5,Hh=10+DH,TH=3,e=TH/2/K,rU=sw?Math.PI/2:0,rV=sw?0:Math.PI/2;
    const run=(ua,va,ub,vb,alongU)=>{const L=Math.hypot(ub-ua,vb-va)*K,n=Math.max(1,Math.ceil(L/6)),len=L/n;
      for(let i=0;i<n;i++){const f=(i+.5)/n,[x,z]=palW(p,ua+(ub-ua)*f,va+(vb-va)*f);bk(x,z).w.push([x,z,len+.2,TH,Hh,alongU?rU:rV,undefined,(jn++)%3])}};
    const{u:BU,v0:B0,v1:B1,g}=BLUE;
    run(-BU-e,B0,BU+e,B0,true);run(-BU-e,B1,-g,B1,true);run(g,B1,BU+e,B1,true);   // 奥・手前（手前は門の開口をあける）
    run(-BU,B0+e,-BU,B1-e,false);run(BU,B0+e,BU,B1-e,false);                       // 左右
    for(const sg of[-1,1]){const[x,z]=palW(p,sg*(g+2.6/K),B1);bk(x,z).m.push([x,z,20+DH])}
  }
  t.wallB=B;
}
function buildMoat(t){                                          // 水路の水面（外壁の外 41.5〜56.5m の帯）を8mごとの四角形で
  const B=new Map(),P=(a,e,o)=>[t.x+Math.cos(a)*(e+o),t.z+Math.sin(a)*(e+o)];
  for(let a=0;a<Math.PI*2;){
    const e1=townEdge(t,a),a2=a+8/(e1+49),e2=townEdge(t,a2),p0=P(a,e1,41.5),p1=P(a,e1,56.5),p2=P(a2,e2,56.5),p3=P(a2,e2,41.5);
    const k=Math.floor((p0[0]+p2[0])/2/CHUNK)+','+Math.floor((p0[1]+p2[1])/2/CHUNK);let b=B.get(k);if(!b){b=[];B.set(k,b)}
    b.push([...p0,...p1,...p2,...p3]);a=a2;
  }
  t.moatB=B;
}
function bridgeAt(x,z){                                         // 水路にかかる橋の上か（面の高さはTOWN_H）
  for(const t of nearTowns(x,z))for(const q of t.roads){
    const zr=q.ax==='z';if(Math.abs((zr?x:z)-q.c)>=5)continue;
    const s=q.sg*((zr?z:x)-(zr?t.z:t.x));if(s>=q.s1+35&&s<=q.s1+55)return true;
  }
  return false;
}
function buildDeck(t){                                          // 主要な道の橋: 宮殿側の傾斜路・平らな橋桁・欄干・橋脚、外壁の門楼（階段は門楼の中）
  t.gates=[];t.stairs=[];
  const B=new Map(),bk=(x,z)=>{const k=Math.floor(x/CHUNK)+','+Math.floor(z/CHUNK);let b=B.get(k);if(!b){b={box:[],pr:[],pc:[],gh:[],fz:[]};B.set(k,b)}return b};
  if(t.kind==='city'){
    // 都市は水堀を渡る橋だけを設置。街の内部に橋桁・門楼・階段は作らない。
    for(const q of t.roads){
      const zr=q.ax==='z',ctr=zr?t.z:t.x,W=s=>ctr+q.sg*s,pos=(s,l)=>zr?[q.c+l,W(s)]:[W(s),q.c+l];
      const b0=q.s1+35,b1=q.s1+55;
      for(let s=b0;s<b1-1e-6;s+=10){
        const s2=Math.min(b1,s+10),len=s2-s+.25,mid=(s+s2)/2,p=pos(mid,0),b=bk(p[0],p[1]);
        b.box.push([p[0],TOWN_H-.46,p[1],zr?10:len,1,zr?len:10]);
        for(const sd of[-1,1]){const pp=pos(mid,sd*4.6);b.fz.push([pp[0],TOWN_H+.5,pp[1],zr?.8:len,1,zr?len:.8,FZ_C]);b.box.push([pp[0],TOWN_H+1.1,pp[1],zr?1:len,.2,zr?len:1])}
      }
      for(const ss of[b0+1.5,(b0+b1)/2,b1-1.5]){const p=pos(ss,0),b=bk(p[0],p[1]);b.box.push([p[0],TOWN_H-3.1,p[1],zr?9:1.6,4.2,zr?1.6:9])}
      for(const sd of[-1,1]){const p=pos((b0+b1)/2,sd*4.7);t.gates.push({x:p[0],z:p[1],w:zr?.6:b1-b0,d:zr?b1-b0:.6,top:TOWN_H+1,bot:TOWN_H-.5,m:.1})}
    }
    t.deckB=B;return;
  }
  for(const q of t.roads){
    const zr=q.ax==='z',ctr=zr?t.z:t.x,W=s=>ctr+q.sg*s,pos=(s,l)=>zr?[q.c+l,W(s)]:[W(s),q.c+l],YB=TOWN_H-8;
    const sL=q.s1-16;                                           // 門楼の奥（城壁の中の16m）はこの手前から。橋は奥の壁(s1)で門楼の広間へ出る。橋桁はその手前まで
    for(let s=q.sf;s<sL-1e-6;s+=16){
      const s2=Math.min(sL,s+16),a0=s>q.sf+1e-6?s-.2:s,a1=s2<sL-1e-6?s2+.2:s2,len=a1-a0,mid=(a0+a1)/2,p=pos(mid,0),b=bk(p[0],p[1]);   // 橋桁どうしは0.2mだけ重ね、宮殿の城壁の土台・門楼とは重ねない（面が重なってチラつくため）
      b.box.push([p[0],TOWN_H+DH-.7,p[1],zr?RW:len,1.4,zr?len:RW]);
      for(const sd of[-1,1]){const pp=pos(mid,sd*(RW/2-.4));b.fz.push([pp[0],TOWN_H+DH+.5,pp[1],zr?.8:len,1,zr?len:.8,FZ_C]);b.box.push([pp[0],TOWN_H+DH+1.1,pp[1],zr?1:len,.2,zr?len:1])}
      for(const ss of s2>=sL-1e-6?[s,s2]:[s])for(const sd of[-1,1]){const pp=pos(ss,sd*5),bb=bk(pp[0],pp[1]);bb.box.push([pp[0],TOWN_H+(DH-1.4)/2,pp[1],2,DH-1.4,2]);bb.pc.push([pp[0],pp[1],1.2])}
    }
    const b0=q.s1+35,b1=q.s1+55;                                 // 水路の橋（門楼の前の道。外壁の外 39〜59m）
    for(let s=b0;s<b1-1e-6;s+=10){
      const s2=Math.min(b1,s+10),len=s2-s+.2,mid=(s+s2)/2,p=pos(mid,0),b=bk(p[0],p[1]);
      b.box.push([p[0],TOWN_H-.46,p[1],zr?10:len,1,zr?len:10]);
      for(const sd of[-1,1]){const pp=pos(mid,sd*4.6);b.fz.push([pp[0],TOWN_H+.5,pp[1],zr?.8:len,1,zr?len:.8,FZ_C]);b.box.push([pp[0],TOWN_H+1.1,pp[1],zr?1:len,.2,zr?len:1])}
    }
    for(const s of[b0+1.5,(b0+b1)/2,b1-1.5]){const p=pos(s,0),b=bk(p[0],p[1]);b.box.push([p[0],TOWN_H-3.1,p[1],zr?9:1.6,4.2,zr?1.6:9])}   // 橋脚
    for(const sd of[-1,1]){const p=pos((b0+b1)/2,sd*4.7);t.gates.push({x:p[0],z:p[1],w:zr?.6:b1-b0,d:zr?b1-b0:.6,top:TOWN_H+1,bot:TOWN_H-.5,m:.1})}   // 橋の欄干
    const sM=q.s1-2,gm=pos(sM,0);bk(gm[0],gm[1]).gh.push([zr,q.sg,gm[0],gm[1]]);    // 門楼: 局所座標 v=-14(街側)〜+22(壁の外)。奥の壁は v=2、広間は v=2〜22
    const R=(u,v,w,d,top,bot,m)=>{const p=pos(sM+v,u),r={x:p[0],z:p[1],w:zr?w:d,d:zr?d:w,top:TOWN_H+top,m:m===undefined?.3:m};if(bot!==undefined)r.bot=TOWN_H+bot;return r};
    t.gates.push(R(0,5.6,26,7.2,DH,DH-1.4),R(0,9.2,16,.4,DH+1.1,DH-.1));            // 広間の2階の床(下は通れる)と手すり
    for(const sd of[-1,1]){
      t.gates.push(R(sd*13,-6,18,16,DH),R(sd*14,-6,16,16,24,DH),R(sd*17.5,15.4,9,26.8,24),R(sd*13.25,29.4,17.5,1.2,24));   // 奥の壁(下の塊と上の塊)・広間の側壁
      for(let i=0;i<40;i++)t.stairs.push(R(sd*10.5,22-(i+.5)*.32,5,.32,(i+1)*.3,undefined,.25));   // 広間の左右の階段
    }
  }
  t.deckB=B;
}
const MOAT_M=new THREE.MeshLambertMaterial({color:0x3b7fa6,transparent:true,opacity:.82,side:THREE.DoubleSide});
const SHOP_C=[0xb5483a,0x2f7f78,0xd9a441,0xe8dcc0,0x7a4d9a,0xc96f2e].map(c=>new THREE.Color(c)),SHOP_WOOD=new THREE.Color(0x6a4a2c),ACC=[0x2f7f78,0x2a5f9a,0xb5483a,0xc99a3a,0x7a4d9a].map(c=>new THREE.Color(c));   // ACC=砂漠の街の差し色（青緑・青・赤茶・金・紫）
const GOLD_M=new THREE.MeshLambertMaterial({color:0xe0b840}),GOLD_C=new THREE.Color(0xe0b840);   // 金（先端の飾り・時計）

const towG=new THREE.CylinderGeometry(1,1,1,10),WIN_M=new THREE.MeshLambertMaterial({color:0x2b2118});
const ballG=new THREE.SphereGeometry(1,8,6);
function addGate(g,geos,zr,sg,gx,gz){                           // 門楼: 奥(街側)=城壁の中の塊に下の門(通路)と橋の門、手前=エントランスの広間。広間の左右に階段が上り、奥の2階の床から橋の門へ
  const H=24,ex=(sh,d,z0)=>{const e=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:false});e.translate(0,0,z0);geos.push(e);return e};
  const bk=new THREE.Shape();bk.moveTo(-22,0);bk.lineTo(-4,0);bk.lineTo(-4,5.4);bk.quadraticCurveTo(-4,7.7,0,9);bk.quadraticCurveTo(4,7.7,4,5.4);bk.lineTo(4,0);bk.lineTo(22,0);bk.lineTo(22,H);bk.lineTo(-22,H);bk.closePath();
  const ho=new THREE.Path();ho.moveTo(-6,DH);ho.lineTo(6,DH);ho.lineTo(6,DH+5);ho.quadraticCurveTo(6,DH+7.2,0,DH+8);ho.quadraticCurveTo(-6,DH+7.2,-6,DH+5);ho.closePath();bk.holes.push(ho);
  const fr=new THREE.Shape();fr.moveTo(-22,0);fr.lineTo(-4.5,0);fr.lineTo(-4.5,6);fr.quadraticCurveTo(-4.5,8.6,0,10);fr.quadraticCurveTo(4.5,8.6,4.5,6);fr.lineTo(4.5,0);fr.lineTo(22,0);fr.lineTo(22,H);fr.lineTo(-22,H);fr.closePath();
  const G=new THREE.Group();G.position.set(gx,TOWN_H,gz);G.rotation.y=zr?(sg>0?0:Math.PI):(sg>0?Math.PI/2:-Math.PI/2);g.add(G);
  const add=m=>{m.castShadow=m.receiveShadow=true;G.add(m);return m};
  add(new THREE.Mesh(ex(bk,16,-14),GATE_M));add(new THREE.Mesh(ex(fr,1.2,28.8),GATE_M));     // 奥の塊 / 正面の壁（小さな門）
  const bx=(w,h,d,x,y,z)=>{const bg=new THREE.BoxGeometry(w,h,d),uv=bg.attributes.uv,dm=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];for(let i=0;i<uv.count;i++){const f=Math.floor(i/4);uv.setXY(i,uv.getX(i)*dm[f][0]/2,uv.getY(i)*dm[f][1]/2)}geos.push(bg);const m=add(new THREE.Mesh(bg,PAL_M));m.position.set(x,y,z)};
  bx(26,2,26.8,0,23,15.4);bx(26,1.4,7.2,0,DH-.7,5.6);bx(16,1.1,.4,0,DH+.55,9.2);bx(44,8,44,0,-4.08,8);   // 広間の天井・2階の床・手すり・土台
  for(const sd of[-1,1])bx(9,H,26.8,sd*17.5,H/2,15.4);   // 側壁
  const tm=new THREE.InstancedMesh(boxG,PAL_M,80),dm=new THREE.Object3D();let n=0;
  for(const sd of[-1,1])for(let i=0;i<40;i++){const top=(i+1)*.3;dm.position.set(sd*10.5,top/2,22-(i+.5)*.32);dm.rotation.set(0,0,0);dm.scale.set(5,top,.32);dm.updateMatrix();tm.setMatrixAt(n++,dm.matrix)}
  tm.frustumCulled=false;tm.castShadow=tm.receiveShadow=true;G.add(tm);
  {const cm=new THREE.InstancedMesh(boxG,PAL_M,64),d2=new THREE.Object3D();let c=0;       // 門楼の屋根の縁の胸壁
    const put=(x,z,w,d)=>{if(c>=64)return;d2.position.set(x,H+1.65,z);d2.rotation.set(0,0,0);d2.scale.set(w,1.3,d);d2.updateMatrix();cm.setMatrixAt(c++,d2.matrix)};
    for(let x=-21.6;x<=21.7;x+=3.2){put(x,29.5,1.7,.9);put(x,-13.5,1.7,.9)}
    for(let z=-10.3;z<=26.4;z+=3.2){put(-22.5,z,.9,1.7);put(22.5,z,.9,1.7)}
    cm.count=c;cm.frustumCulled=false;cm.castShadow=cm.receiveShadow=true;G.add(cm)}
  {const FR=new THREE.InstancedMesh(boxG,PAL_M,100),WN=new THREE.InstancedMesh(boxG,WIN_M,100),d3=new THREE.Object3D();let nf=0;      // 門楼の外壁の小窓と縁取り
    const win=(x,y,z,ax,w,h)=>{const fx=ax?.3:w+.8,fz=ax?w+.8:.3,wx=ax?.2:w,wz=ax?w:.2,dx=ax?Math.sign(x)*.12:0,dz=ax?0:Math.sign(z)*.12;
      d3.rotation.set(0,0,0);d3.position.set(x,y,z);d3.scale.set(fx,h+.8,fz);d3.updateMatrix();FR.setMatrixAt(nf,d3.matrix);
      d3.position.set(x+dx,y,z+dz);d3.scale.set(wx,h,wz);d3.updateMatrix();WN.setMatrixAt(nf,d3.matrix);nf++};
    for(const y of[15,20])for(let x=-18;x<=18;x+=6)win(x,y,30.1,false,1.4,2.6);
    for(const x of[-19,-14,-9,9,14,19])win(x,4.2,30.1,false,1.2,2);
    for(const sd of[-1,1])for(const y of[7,14,20])for(let v=-8;v<=22;v+=6)win(sd*22.1,y,v,true,1.4,2.4);
    FR.count=WN.count=nf;for(const m of[FR,WN]){m.frustumCulled=false;m.castShadow=m.receiveShadow=true;G.add(m)}}
  bx(46,1,44,0,H+.5,8);bx(14,8,10,0,H+5,14);
  const ball=add(new THREE.Mesh(ballG,CAP_M));ball.scale.set(5,6.2,5);ball.position.set(0,H+13.5,14);
  const sp=add(new THREE.Mesh(capG,MIN_M));sp.scale.set(.9,2.4,.9);sp.position.set(0,H+22.2,14);
}
function prismGeo(a){
  const[zr,w0,w1,p0,p1,yb,ya,yc]=a,P=(w,l,y)=>zr?[l,y,w]:[w,y,l];
  const A=P(w0,p0,yb),B=P(w0,p1,yb),C=P(w1,p1,yb),D=P(w1,p0,yb),a1=P(w0,p0,ya),b1=P(w0,p1,ya),c1=P(w1,p1,yc),d1=P(w1,p0,yc),v=[];
  for(const[q0,q1,q2,q3] of[[a1,b1,c1,d1],[A,D,C,B],[A,B,b1,a1],[D,C,c1,d1],[A,D,d1,a1],[B,C,c1,b1]])v.push(...q0,...q1,...q2,...q0,...q2,...q3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return g;
}
// ---------- 気候帯とバイオーム ----------
// 気温tと湿度mの低周波ノイズ2枚で4つの気候帯（熱帯・乾燥帯・温帯・冷帯）を決め、中周波ノイズvで帯の中の植生（草原/森/ジャングルなど）を分ける。境目はなめらかに混ざる。
//  乾燥帯: 奥=砂漠、他の帯との境目=サバンナ / 温帯: 乾燥帯側=ステップ、草原、広葉樹林 / 熱帯: 草原・森・ジャングル / 冷帯: 奥=雪原、縁=針葉樹林と草原（雪はまだらに積もる）
const CLIM_F=.0003;                                              // 気候帯の細かさ（小さいほど広い。約3km周期で、植生の切り替わりはおよそ1kmに1回）
const CONT=32400,CONT_O=10800,contCache=new Map();let _ctI=NaN,_ctJ=NaN,_ctK=null;
function contOfCell(i,j){
  const key=i+','+j;if(contCache.has(key))return contCache.get(key);
  const r=mulberry(hash(i,j,SEED+4242)*1e9|0),ex=i*CONT+5400,ez=j*CONT+5400,th=r()*6.2832,rx=8000+r()*2000,ry=rx*(.55+.25*r());
  const ax=Math.cos(th),az=Math.sin(th),side=r()<.5?-1:1,k={i,j,ex,ez,th,rx,ry,ax,az,ph:[r()*6.28,r()*6.28,r()*6.28],ox:r()*100,oz:r()*100};
  k.x=ex+ax*.28*rx;k.z=ez+az*.28*rx;                                  // 大陸の中心（王都は中心から少し端寄り）
  const P=(u,v)=>[k.x+ax*u*rx-az*v*ry,k.z+az*u*rx+ax*v*ry];
  const D=P(.55,-side*.15);k.dx=D[0];k.dz=D[1];k.dr=2800+r()*1600;      // 砂漠の中心と半径（2.8〜4.4km。オアシスが出る場所を増やすため広め）
  k.rg=[[.05,.62],[.32,.58],[.58,.64],[.82,.55]].map(([u,v])=>P(u+(r()-.5)*.08,side*(v+(r()-.5)*.1)));   // 山脈の稜線
  k.rW=1000+r()*300;k.rH=230+r()*90;
  k.sg=[0,1,2].map(n=>[k.rg[n][0],k.rg[n][1],k.rg[n+1][0],k.rg[n+1][1]]);
  k.pk=k.rg.slice(1).map(p=>({x:p[0],z:p[1],R:k.rW*.9,rv:null,nr:1+(r()<.4?1:0)}));   // 川の源（山頂ごとに1〜2本）
  contCache.set(key,k);return k;
}
function contAt(x,z){const i=Math.floor((x+CONT_O)/CONT),j=Math.floor((z+CONT_O)/CONT);if(i!==_ctI||j!==_ctJ){_ctI=i;_ctJ=j;_ctK=contOfCell(i,j)}return _ctK}
function contD(x,z){                                                // 海岸線までの距離の目安(m)。負=陸
  const k=contAt(x,z),dx=x-k.x,dz=z-k.z,u=(dx*k.ax+dz*k.az)/k.rx,v=(-dx*k.az+dz*k.ax)/k.ry,a=Math.atan2(v,u);
  const lobe=1+.10*Math.sin(2*a+k.ph[0])+.07*Math.sin(3*a+k.ph[1])+.05*Math.sin(5*a+k.ph[2])+.24*(vnoise(x*.0005+k.ox,z*.0005+k.oz)-.5);
  return (Math.hypot(u,v)/lobe-1)*k.ry;
}
function rangeBump(x,z){                                            // 山脈の高さ(m)。稜線までの距離で、ふもとの丘陵→尾根
  const k=contAt(x,z);if(Math.hypot(x-k.x,z-k.z)>k.rx*1.1)return 0;
  let d=1e9;for(const s of k.sg){const v=segD(x,z,s);if(v<d)d=v}
  const W=k.rW*(1+.4*(vnoise(x*.002+k.ox,z*.002)-.5)),t=d/(W*2.4);if(t>=1)return 0;
  const foot=(1-t)*(1-t)*35,u=d/W;if(u>=1)return foot;
  const rid=1-Math.abs(vnoise(x*.0055+k.oz,z*.0055-k.ox)*2-1),f=Math.pow(1-u*u,1.7);
  return foot+k.rH*f*(.72+.4*rid)+(vnoise(x*.022+7,z*.022-3)-.5)*16*f;
}
const CV={de:0,sv:0,st:0,gr:0,bf:0,tg:0,tf:0,jg:0,cg:0,ta:0,tu:0,sq:0,sn:0,ic:0,A:0,T:0,M:0,C:0};   // climateAtの結果（使い回すので、呼んだらすぐ読むこと。12種の植生の重みの合計は1。sq=セコイアの森は広葉樹林・針葉樹林の一部）
const nz3=(x,z,f,ox,oz)=>(vnoise(x*f+ox,z*f+oz)+.35*vnoise(x*f*2.3-ox*.3,z*f*2.3+oz*.7)+.1*vnoise(x*f*5.1+ox*.1,z*f*5.1-oz*.2))/1.45;   // 細かい成分は弱く（境界がぎざぎざにならないように）
function climateAt(x,z){
  let m=nz3(x,z,CLIM_F,300,-200),t=nz3(x,z,CLIM_F*.85,-700,450),v=(vnoise(x*.001+500,z*.001-300)+.5*vnoise(x*.0024-90,z*.0024+60))/1.5;
  {const k=contAt(x,z),wE=1-sm01(5500,8500,Math.hypot(x-k.ex,z-k.ez)),wD=1-sm01(k.dr*.55,k.dr*1.05,Math.hypot(x-k.dx,z-k.dz));   // 王都のまわりは温帯、砂漠の中心は乾燥帯
    m+=(.56-m)*wE;t+=(.57-t)*wE;m+=(.2-m)*wD}
  const A=1-sm01(.37,.49,m),nA=1-A,C=nA*(1-sm01(.40,.54,t)),T=nA*sm01(.56,.70,t),M=nA-C-T;
  const de=A*(1-sm01(.33,.43,m));CV.de=de;CV.sv=A-de;                                            // 乾燥帯
  const st=M*(1-sm01(.44,.58,m)),rm=M-st,bf=rm*sm01(.42,.58,v);CV.st=st;CV.bf=bf;CV.gr=rm-bf;    // 温帯
  const vj=v+(m-.5)*.6,tg=T*(1-sm01(.30,.46,vj)),jg=T*sm01(.46,.62,vj);CV.tg=tg;CV.jg=jg;CV.tf=T-tg-jg;   // 熱帯（湿度が高いほどジャングル）
  const tu=C*(1-sm01(.30,.46,t)),rc=C-tu,ta=rc*sm01(.41,.57,v);CV.tu=tu;CV.ta=ta;CV.cg=rc-ta;     // 冷帯
  CV.sn=tu+rc*sm01(.5,.75,vnoise(x*.004+17,z*.004-9));                                            // 雪の積もり具合（雪原=1、縁はまだら）
  CV.ic=C*(1-sm01(.20,.32,t));                                                                    // 氷河帯（雪原tuの奥。縁は雪原へなめらかに続く）
  CV.sq=0;
  if(CV.bf+CV.ta>.02){                                                                           // セコイアの森: 湿った広葉樹林・針葉樹林のうち、広い斑（約2.5km）になった所
    const sqm=sm01(.58,.66,nz3(x,z,.00027,1900,-1300))*sm01(.45,.62,v),b=CV.bf*sqm,a=CV.ta*sqm;
    CV.bf-=b;CV.ta-=a;CV.sq=b+a;
  }
  CV.A=A;CV.T=T;CV.M=M;CV.C=C;return CV;
}
function canopyRaw(x,z){return vnoise(x*.03+11,z*.03+5)*.65+vnoise(x*.08-4,z*.08+9)*.35}   // 森の密度むら(0〜1)。高いほど木が密で暗い
// ---------- 巨大な山と川 ----------
// 森（広葉樹林・針葉樹林・熱帯林）のまん中に、まれに巨大な山ができる（MCm四方の区画ごとに最大1つ。区画の中央寄りに置くので、山は自分の区画の外にはみ出さない）。
// 山の中腹までは森が続き、森林限界(mtTL)より上は岩と草地、さらに上は雪。山頂付近を源流に2〜4本の川が下り、必ず海(WATERより低い所)まで流れる。
// 川は rawH(山を含む地形) だけを見て下るので、街・植生には依存しない（heightAtが川の溝を彫り、チャンクが水面のリボンを張る）。
const RV_POOL=4;                                      // 窪みにたまる水の最大の深さ / 水面を横へ広げる最大の距離
function mtOfCell(ix,iz){
  const k=ix+','+iz;if(mtCache.has(k))return mtCache.get(k);
  mtCache.set(k,null);                                          // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+9091)*1e9|0);
  let m=null;
  if(r()<MT_P){
    const R=650+r()*150,H=230+r()*110,ox=r()*100,oz=r()*100;
    for(let n=0;n<24&&!m;n++){
      const x=(ix+.35+r()*.3)*MC,z=(iz+.35+r()*.3)*MC;
      let c=climateAt(x,z),f=c.bf+c.ta+c.tf+c.sq;                    // 森バイオームのまん中か（CVはすぐ読む）
      if(f<.75)continue;
      let sum=0;for(let i=0;i<8;i++){c=climateAt(x+Math.cos(i*.785)*R*.8,z+Math.sin(i*.785)*R*.8);sum+=c.bf+c.ta+c.tf+c.sq}
      if(sum/8<.45)continue;                                    // 山のふもとも、おおむね森
      if(rawH(x,z)<1)continue;                                  // 海・湖の上は避ける
      m={x,z,R,H,ox,oz,Rf:R*2.6,R2:R*2.6*R*2.6,rv:null};   // Rf=ふもとの丘陵(森がずっと続く台地)の半径
    }
  }
  mtCache.set(k,m);_mbIx=NaN;return m;
}
function mtBump(x,z){                                           // 山の高さ(m)。山の外は0
  const ix=Math.floor(x/MC),iz=Math.floor(z/MC);
  if(ix!==_mbIx||iz!==_mbIz){const m0=mtOfCell(ix,iz);_mbIx=ix;_mbIz=iz;_mbM=m0}
  const m=_mbM;if(!m)return 0;
  const dx=x-m.x,dz=z-m.z,d2=dx*dx+dz*dz;if(d2>=m.R2)return 0;
  const nn=vnoise(x*.0032+m.ox,z*.0032+m.oz)-.5,u=Math.sqrt(d2)/(m.R*(1+.5*nn));   // 輪郭をゆがめる
  const t=Math.sqrt(d2)/m.Rf,ft=1-t*t,foot=ft*ft*40;                                  // ふもとの丘陵: 山のまわりを最大+40m持ち上げる（海・湖が山の足もとまで来ない＝川が陸を長く流れる）
  if(u>=1)return foot;
  const f=Math.pow(1-u*u,1.7),rid=1-Math.abs(vnoise(x*.0055+m.oz,z*.0055-m.ox)*2-1);   // 裾野はなめらかに0へ・尾根と谷
  return foot+m.H*f*(.72+.4*rid)+(vnoise(x*.022+7,z*.022-3)-.5)*16*f;
}
const mtTL=(x,z)=>135+40*(vnoise(x*.02+31,z*.02-17)-.5);        // 森林限界（山の標高。これより上は木が生えない）
const LKH=new Map(),LKC=256;                                      // 川の終点の湖（空間ハッシュ）。川と同じく読み込み時に登録される
function addLake(x,z,R){
  const lk={x,z,R},e=R*1.7;
  for(let X=Math.floor((x-e)/LKC);X<=Math.floor((x+e)/LKC);X++)for(let Z=Math.floor((z-e)/LKC);Z<=Math.floor((z+e)/LKC);Z++){const k=X+','+Z;let a=LKH.get(k);if(!a){a=[];LKH.set(k,a)}a.push(lk)}
}
function lakeCut(x,z,h){                                        // 湖の窪み: 中心は水面の3.5m下、縁は元の地形へなめらかに戻る（形は少しいびつ）。地形より高くはしない
  const a=LKH.get(Math.floor(x/LKC)+','+Math.floor(z/LKC));if(!a)return h;
  for(const lk of a){
    const d=Math.hypot(x-lk.x,z-lk.z),Re=lk.R*(.85+.3*vnoise(x*.025+lk.x*.01,z*.025+lk.z*.01));
    if(d>=Re*1.25)continue;
    const t=sm01(.5,1.25,d/Re),b=(WATER-3.5)+(h-(WATER-3.5))*t;if(b<h)h=b;
  }
  return h;
}
function genRiver(m,a,rr,st){                                   // st={x,z}: 本流の途中から分かれる支流（細い）
  const STEP=16,P=[],rs=m.R*(.2+.1*rr());let x=st?st.x:m.x+Math.cos(a)*rs,z=st?st.z:m.z+Math.sin(a)*rs,hd=a,hb=a,sea=false;
  for(let n=0;n<560;n++){
    const h=rawH(x,z);P.push({x,z,h});
    if(n>3&&h<WATER+(st?.4:4.6)){sea=true;break}      // 本流は海または湖だった低地に着いたら終わり（湖を埋めたため）                         // 海に着いた
    if(Math.hypot(x-m.x,z-m.z)>6900)break;                      // 遠くまで行き過ぎ（隣の区画の山の川と干渉しない範囲）
    let bj=0,bh=1e9;
    for(let j=-2;j<=2;j++){                                     // 前方±35°のいちばん低い方へ（進行方向の基準hbから大きくは曲がらない＝同じ所をぐるぐる回らない）
      const aa=hd+j*.3;if(Math.abs(aa-hb)>1.1)continue;
      const hh=rawH(x+Math.cos(aa)*STEP*1.5,z+Math.sin(aa)*STEP*1.5)+Math.abs(j)*.4;
      if(hh<bh){bh=hh;bj=j}
    }
    hd+=bj*.17+(rr()-.5)*.1;hb+=(hd-hb)*.06;
    x+=Math.cos(hd)*STEP;z+=Math.sin(hd)*STEP;
  }
  if(!sea||P.length<8)return null;                              // 海に着かなかった川は作らない
  if(!st){                                                      // 本流の終点（河口）に湖を作る。川が途中で途切れて見えないように、川の進む向きの少し先を中心にする
    const E=P[P.length-1],LR=55+hash(Math.round(E.x),Math.round(E.z),SEED+3131)*55;
    addLake(E.x+Math.cos(hd)*LR*.35,E.z+Math.sin(hd)*LR*.35,LR);
  }
  const q=P[P.length-1];P.push({x:q.x+Math.cos(hd)*STEP,z:q.z+Math.sin(hd)*STEP,h:WATER-3});   // 河口の先（海の中）まで延ばす
  const N=P.length,hs=P.map((p,i)=>{let s=0,c=0;for(let j=-2;j<=2;j++){const o=P[i+j];if(o){s+=o.h;c++}}return s/c});   // 川底の高さは前後5点でなめらかにならす
  for(let i=0;i<N;i++){                                         // 川底: 地面より2.2m下。上流より高くはならない（必ず下り）
    const p=P[i],bed=hs[i]-2.2;                                  // 川底は地面の2.2m下（地形に沿う。上流より低くなるよう無理に掘り下げない）
    
    const hw=(2.6+5.4*sm01(0,110,i))*(st?.62:1),dep=.95+.06*hw;              // 川幅は下流ほど広く
    p.b=bed;p.hw=hw;p.y=bed+dep;p.y0=p.y;p.ww=hw+1.8;
  }
  {                                                              // 水面: 水は低い方へ流れ、窪みにたまり、下流の一番高い所（いちばん低い縁）からあふれる。水面は下流へ向かって上がらない
    const S=new Array(N);let sm=-1e9;
    for(let i=N-1;i>=0;i--){sm=Math.max(sm,P[i].y0);S[i]=Math.min(sm,P[i].y0+RV_POOL)}   // 下流で越える最も高い水面まで（たまる深さには上限）
    for(let i=0;i<N;i++){if(i>0)S[i]=Math.min(S[i],S[i-1]);P[i].y=Math.max(S[i],P[i].y0)}
  }
  for(let i=0;i<N;i++){                                         // 水面リボンの左右の頂点
    const a0=P[Math.max(0,i-1)],a1=P[Math.min(N-1,i+1)],p=P[i];
    let tx=a1.x-a0.x,tz=a1.z-a0.z;const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l;
    p.lx=p.x-tz*p.ww;p.lz=p.z+tx*p.ww;p.rx=p.x+tz*p.ww;p.rz=p.z-tx*p.ww;
  }
  const RV={P};
  for(let i=0;i<N-1;i++){                                       // 空間ハッシュ（RVCm四方）に線分を登録。影響範囲(約20m)ぶん広げる
    const a0=P[i],a1=P[i+1],s={x0:a0.x,z0:a0.z,x1:a1.x,z1:a1.z,b0:a0.b,b1:a1.b,h0:a0.hw,h1:a1.hw,R:RV,i};
    const X0=Math.floor((Math.min(a0.x,a1.x)-20)/RVC),X1=Math.floor((Math.max(a0.x,a1.x)+20)/RVC),Z0=Math.floor((Math.min(a0.z,a1.z)-20)/RVC),Z1=Math.floor((Math.max(a0.z,a1.z)+20)/RVC);
    for(let X=X0;X<=X1;X++)for(let Z=Z0;Z<=Z1;Z++){const k=X+','+Z;let L=RVH.get(k);if(!L){L=[];RVH.set(k,L)}L.push(s)}
  }
  return RV;
}
function desertRiverSrc(k){                                       // 砂漠の川: 砂漠の中心から一番近い海岸の向きを調べ、砂漠の奥（海と反対側）を源に、海へ向かって流す。向きは少しずつずらして何通りか試し、海に着いたものだけ採用する
  if(k.dm)return k.dm;
  let best=1e9,ba=0;
  for(let a=0;a<24;a++){const ang=a*Math.PI/12;let d=0;while(d<12000){if(contD(k.dx+Math.cos(ang)*d,k.dz+Math.sin(ang)*d)>-400)break;d+=200}if(d<best){best=d;ba=ang}}
  const ux=Math.cos(ba),uz=Math.sin(ba),up=Math.min(k.dr*.45,1800);   // 源は砂漠の中心から、海と反対側へ少し（川が長すぎて海に着かないのを防ぐ）
  
  k.dm={x:k.dx-ux*up,z:k.dz-uz*up,R:700,rv:null,nr:2,ang:[ba,ba+.45,ba-.45,ba+.9,ba-.9,ba+1.35]};
  return k.dm;
}
function mtRivers(m){
  if(m.rv)return m.rv;
  m.rv=[];
  const rr=mulberry(hash(Math.round(m.x),Math.round(m.z),SEED+5151)*1e9|0),n=m.nr||(2+Math.floor(rr()*3)),a0=rr()*6.2832;
  for(let k=0;k<n+6&&(m.rv.length<n);k++){                      // 海に着いた川だけ採用（着かなければ別の向きでやり直し）
    const R=genRiver(m,m.ang?m.ang[k%m.ang.length]+(rr()-.5)*.7:a0+k*6.2832/n+(rr()-.5)*.8,rr);if(R)m.rv.push(R);   // 砂漠の川(m.ang)は海へ向かう向きの候補から
  }
  for(const R0 of m.rv.slice()){                                  // 本流の途中から分かれる支流（各河川に最大2本）
    const N=R0.P.length;
    for(let b=0;b<2;b++)for(let t=0;t<5;t++){
      const i=Math.floor(N*(.2+.5*rr())),p=R0.P[i],q=R0.P[i+1]||p,a=Math.atan2(q.z-p.z,q.x-p.x)+(rr()<.5?-1:1)*(.7+rr()*.5);
      const B=genRiver(m,a,rr,{x:p.x,z:p.z});if(B){B.branch=1;m.rv.push(B);break}
    }
  }
  if(GEN_OTHER_TOWNS||GEN_RIVER_VILLAGES)for(const R of m.rv)findSites(R,m);        // 川沿いの村（居住可能エリアの中だけ）
  return m.rv;
}
function ensureRivers(x,z){                                     // この位置の周り3x3区画の山の川を作っておく
  const ix=Math.floor(x/MC),iz=Math.floor(z/MC);
  if(ix===_rvIx&&iz===_rvIz)return;
  _rvIx=ix;_rvIz=iz;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const m=mtOfCell(ix+a,iz+b);if(m)mtRivers(m)}
  {const ci=Math.floor((x+CONT_O)/CONT),cj=Math.floor((z+CONT_O)/CONT);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const k=contOfCell(ci+a,cj+b);if(Math.hypot(x-k.x,z-k.z)<k.rx*1.6+3000){for(const m of k.pk)mtRivers(m);mtRivers(desertRiverSrc(k))}}}   // 山脈の山頂の川と、砂漠を流れる川
  ensurePorts(ix,iz);                                          // 帝国の海沿いの港町
}
function riverScan(x,z){                                        // 最寄りの川の「縁までの距離」(中心線までの距離-川幅の半分)・川底の高さ・川幅
  RN_E=1e9;
  const L=RVH.get(Math.floor(x/RVC)+','+Math.floor(z/RVC));if(!L)return false;
  for(const s of L){
    const dx=s.x1-s.x0,dz=s.z1-s.z0;let t=((x-s.x0)*dx+(z-s.z0)*dz)/(dx*dx+dz*dz);t=t<0?0:t>1?1:t;
    const px=s.x0+dx*t-x,pz=s.z0+dz*t-z,hw=s.h0+(s.h1-s.h0)*t,e=Math.sqrt(px*px+pz*pz)-hw;
    if(e<RN_E){RN_E=e;RN_B=s.b0+(s.b1-s.b0)*t;RN_HW=hw}
  }
  return RN_E<1e8;
}
function riverEff(x,z){ensureRivers(x,z);return riverScan(x,z)?RN_E:1e9}
function riverNear(x,z,R,m){                                    // 半径R以内に川(縁からm未満)があるか
  if(riverEff(x,z)<m)return true;
  for(const f of[.5,1])for(let i=0;i<8;i++)if(riverEff(x+Math.cos(i*.785)*R*f,z+Math.sin(i*.785)*R*f)<m)return true;
  return false;
}
function riverCut(x,z,h){                                       // 川の溝を彫る: 川幅の中は平らな川底 → 幅1.5mで水面より少し高い岸の縁へ立ち上がる → その外は元の地形へなめらかに戻る
  ensureRivers(x,z);
  if(!riverScan(x,z))return h;
  const hw=RN_HW,b=RN_B,lip=b+.95+.06*hw+.35,bk=4+.5*hw,e=RN_E;
  if(e>=1.5+bk)return h;
  if(lip<WATER+.5&&h<lip)return h;                              // 海の中では堤を作らない
  if(e<=0)return b;
  if(e<1.5){const t=e/1.5;return b+(lip-b)*t*t*(3-2*t)}
  const u=(e-1.5)/bk;return lip+(h-lip)*u*u*(3-2*u);
}
// ---------- 川沿いの西洋の村 ----------
// 川(mtRiversの川)のうち、ゆるやかで平らな陸が続く草原・森の区間に作る。川沿いの道(主道)・奥の道・それをつなぐ横道に沿って、二階建て・尖った屋根・煙突の家が並ぶ。
// 道と場所は川の形だけで決まる(heightAtに依存しない)ので、地面の色・木の除外にすぐ使える。家は近づいた時に初めて作る(地面の高さを見て、基礎で段差を埋める)。
function vRegister(v){
  for(const s of v.roads){
    const X0=Math.floor((Math.min(s[0],s[2])-22)/VRC),X1=Math.floor((Math.max(s[0],s[2])+22)/VRC),Z0=Math.floor((Math.min(s[1],s[3])-22)/VRC),Z1=Math.floor((Math.max(s[1],s[3])+22)/VRC);
    for(let X=X0;X<=X1;X++)for(let Z=Z0;Z<=Z1;Z++){const k=X+','+Z;let L=VVH.get(k);if(!L){L=[];VVH.set(k,L)}L.push(s)}
  }
}
function segD(x,z,s){const dx=s[2]-s[0],dz=s[3]-s[1];let t=((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1);t=t<0?0:t>1?1:t;return Math.hypot(x-s[0]-dx*t,z-s[1]-dz*t)}
function villageDist(x,z){                                      // 最寄りの村の道の中心線までの距離（村が近くに無ければ大きな値）
  ensureRivers(x,z);
  const L=VVH.get(Math.floor(x/VRC)+','+Math.floor(z/VRC));if(!L)return 1e9;
  let d=1e9;for(const s of L){const e=segD(x,z,s);if(e<d)d=e}
  return d;
}
function habTree(x,z){                                          // 樹木の密度の目安（ミニマップの居住可能地と村の場所選びで共通）
  const cl=climateAt(x,z),cn=sm01(.35,.7,canopyRaw(x,z));
  return cl.ta*(.24+.52*cn)+cl.sq*.05+cl.cg*(.02+.06*cn*cn)+cl.bf*(.2+.4*cn)+cl.sq*.03+cl.gr*(.03+.1*cn*cn)+cl.tg*(.015+.04*cn)+cl.st*.002+cl.jg*(.22+.45*cn)+cl.tf*(.12+.28*cn);
}
function habK(x,z,k){const o=VK;VK=k;try{return habRaw(x,z)}finally{VK=o}}
let VK=1.45;                                                    // 居住可能地の緩さ（1=最初の厳しさ、大きいほど緩い）。既定=ミニマップ用。村ごとに findSites が変える
function habRaw(x,z){                                           // 居住可能地か（ミニマップの緑と同じ基準: 水際より上・斜面と起伏が小さい・高地は平らな台地だけ・森が過密でない）。川や海への近さは呼び出し側で保証する。地形はrawH（川の溝・街の平坦化の前）で見る
  const h=rawH(x,z);if(h<WATER+2)return false;
  const d=10,a=rawH(x-d,z),b=rawH(x+d,z),c=rawH(x,z-d),e=rawH(x,z+d);
  const range=Math.max(h,a,b,c,e)-Math.min(h,a,b,c,e),slope=Math.max(Math.abs(b-a),Math.abs(e-c));
  if(slope>5.5*VK||range>7.5*VK)return false;
  if(h>WATER+95&&range>3.5*VK)return false;
  return habTree(x,z)<=.31*VK;
}
// ---------- 川沿いの村: 地形に合わせた道の生成（地形は平らにならさない）----------
// 順序: ① 主道（川に沿う）→ 枝道（川から離れる向き）を引く → ② 畑の小道と畑 → ③ 家（buildVillage）。
// 道を引くときに守る決まり: 1刻み(VST m)の高低差がVDH以下（段差・崖・土手を通らない）／居住可能地(habRaw)の中／川の縁から9〜VRIV m／
// 同じ村の別の道・他の村の道から VGAP m 以上離す（枝道の根元だけは別）／村の中心から VRMAX m まで（村が広がりすぎない）。
let VX=1;   // 内陸へ広げる村(30%)は 1.7: 川からの距離・村の半径・枝道の長さを広げ、居住可能地の条件も少しゆるめる
const VST=6,VDH=2.2,VGAP=16,VRMAX=160,VRIV=260,VSEP=140;   // VSEP=別の村の道からこの距離(m)以上離す（村の境目を分かりやすくする）
function villageSep(x,z){                                         // 生成済みの別の村の道までの最短距離（VSEPより遠ければ打ち切る）
  let d=1e9;
  for(const v of VLIST){
    if(Math.hypot(x-v.cx,z-v.cz)>VRMAX*(v.vx||1)+VSEP+60)continue;
    for(const s of v.roads){const e=segD(x,z,s);if(e<d)d=e}
  }
  return d;
}
function vhRoad(x,z){return riverCut(x,z,rawH(x,z))}                  // 道を引くときの地面の高さ（川の溝は含み、街や畑の平坦化は含まない）
function psDist(x,z,ax,az,bx,bz){const dx=bx-ax,dz=bz-az;let t=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1);t=t<0?0:t>1?1:t;return Math.hypot(x-ax-dx*t,z-az-dz*t)}
function netDist(net,x,z,skip){                                      // 道の網（点列の配列）までの最短距離。skip=[x,z,r]: 端点が円の中にある小片は無視する（枝道の根元）
  let d=1e9;
  for(const pl of net)for(let i=0;i+1<pl.length;i++){
    const a=pl[i],b=pl[i+1];
    if(skip&&(Math.hypot(a[0]-skip[0],a[1]-skip[1])<skip[2]||Math.hypot(b[0]-skip[0],b[1]-skip[1])<skip[2]))continue;
    const e=psDist(x,z,a[0],a[1],b[0],b[1]);if(e<d)d=e;
  }
  return d;
}
function vOutward(P,x,z){let bj=0,bd=1e9;for(let j=0;j<P.length;j++){const d=Math.hypot(P[j].x-x,P[j].z-z);if(d<bd){bd=d;bj=j}}return Math.atan2(z-P[bj].z,x-P[bj].x)}   // 川から離れる向き
function growRoad(s0,th0,maxLen,net,C,kind,fr){                      // s0から向きth0へ、地形を見ながら1刻みずつ道を伸ばす。kind='t'=主道（川の縁から約14mを保つ）, 'b'=枝道（出だしの向きから±55°、川から離れ気味）
  const pl=[[s0[0],s0[1]]];let th=th0,x=s0[0],z=s0[1],h=vhRoad(x,z),len=0;
  while(len<maxLen){
    let best=null,bc=1e9;
    for(let k=-3;k<=3;k++){
      const a=th+k*.21,qx=x+Math.cos(a)*VST,qz=z+Math.sin(a)*VST;
      if(kind==='b'&&Math.abs(Math.atan2(Math.sin(a-th0),Math.cos(a-th0)))>.96)continue;
      if(Math.hypot(qx-C[0],qz-C[1])>VRMAX*VX)continue;                                        // 村の中心から遠すぎる
      const hq=vhRoad(qx,qz);if(Math.abs(hq-h)>VDH*VK/1.45)continue;                                // 段差
      const hm=vhRoad((x+qx)/2,(z+qz)/2);if(Math.abs(hm-(h+hq)/2)>.8)continue;             // 刻みの途中の溝・土手
      if(!habRaw(qx,qz))continue;                                                           // 居住可能地の外
      const re=riverEff(qx,qz);if(re<9||re>VRIV*VX*VK/1.45)continue;                            // 川の縁に近すぎる／水辺から遠すぎる
      if(netDist(net,qx,qz,[s0[0],s0[1],VGAP])<VGAP)continue;                               // 他の道に近すぎる
      if(villageSep(qx,qz)<VSEP)continue;                                                  // 他の村の道に近すぎる
      const cost=Math.abs(hq-h)*2.5+Math.abs(k)*.5+(kind==='t'?Math.abs(re-14)*.12:-re*.02)+fr()*.5;
      if(cost<bc){bc=cost;best=[a,qx,qz,hq]}
    }
    if(!best)break;
    th=best[0];x=best[1];z=best[2];h=best[3];pl.push([x,z]);len+=VST;
  }
  return pl;
}
function vTrunk(P,i,side,nrm,net,C,fr){                              // 川(P[i]付近)の岸に沿う主道。種の位置は川の縁から10〜22mで条件を満たす所。前後へ75mずつまで
  const p=P[i],n=nrm(i),a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],tg=Math.atan2(b.z-a.z,b.x-a.x);
  let S=null;
  for(const o of[14,10,18,22]){
    const x=p.x+side*n[0]*(p.hw+o),z=p.z+side*n[1]*(p.hw+o);
    if(!habRaw(x,z))continue;const re=riverEff(x,z);if(re<9||re>VRIV*VX)continue;
    if(C&&Math.hypot(x-C[0],z-C[1])>VRMAX*VX)continue;
    if(netDist(net,x,z)<VGAP||villageSep(x,z)<VSEP)continue;
    S=[x,z];break;
  }
  if(!S)return null;
  const Cc=C||S,fw=growRoad(S,tg,75,net,Cc,'t',fr),bw=growRoad(S,tg+Math.PI,75,net.concat([fw]),Cc,'t',fr);
  return{S,pl:bw.reverse().concat(fw.slice(1))};
}
function vBranches(P,trunk,net,C,fr,out){                             // 主道から川と反対向きに枝道（家の通り）を、約44〜58mおきに最大68mまで
  let acc=0,nxt=16+fr()*10;
  for(let j=0;j+1<trunk.length;j++){
    const a=trunk[j],b=trunk[j+1],sl=Math.hypot(b[0]-a[0],b[1]-a[1]);
    while(nxt<=acc+sl){
      const t=(nxt-acc)/sl,sx=a[0]+(b[0]-a[0])*t,sz=a[1]+(b[1]-a[1])*t;
      const pl=growRoad([sx,sz],vOutward(P,sx,sz),(40+fr()*28)*(VX>1?2.2:1),net,C,'b',fr);
      if(pl.length>=4){net.push(pl);out.push(pl)}
      nxt+=44+fr()*14;
    }
    acc+=sl;
  }
}
function vBridges(P,t1,t2){                                           // 両岸の主道を結ぶ橋（最大2本・間隔45m以上・両端の高低差2.5m以内・川幅の2倍＋45m以内）
  const c=[];
  for(let i=0;i<t1.length;i++){
    let bj=-1,bd=1e9;for(let j=0;j<t2.length;j++){const d=Math.hypot(t1[i][0]-t2[j][0],t1[i][1]-t2[j][1]);if(d<bd){bd=d;bj=j}}
    if(bj<0)continue;
    let hw=0,rd=1e9;for(const q of P){const d=Math.hypot(q.x-t1[i][0],q.z-t1[i][1]);if(d<rd){rd=d;hw=q.hw}}
    if(bd>2*hw+45)continue;
    if(Math.abs(vhRoad(t1[i][0],t1[i][1])-vhRoad(t2[bj][0],t2[bj][1]))>3.5)continue;
    c.push({i,bd,a:t1[i],b:t2[bj]});
  }
  c.sort((p,q)=>p.bd-q.bd);
  const out=[];for(const q of c){if(out.every(o=>Math.abs(o.i-q.i)*VST>=45))out.push(q);if(out.length>=2)break}
  return out.map(q=>[q.a,q.b]);
}
// ---------- 村・港町の城: 道を少し伸ばした先に、城を置く（確率）----------
// 城のタイプ: 'land'=段々の土地に城壁・塔・階段・館（castle_land式。1段か2段・丸か四角・館の形もランダム） / 'simple'=大きな正方形の石の城（今までの城）
const VCW=44;   // simple の一辺(m)
const CASTLE_LAND_P=.65;   // 'land' タイプを選ぶ確率（置けない場所では simple にする）
function castleSite(v,net,Lp,cx,cz,half,c,sn,round,hf){          // 城の敷地の検査: 水・川・道・畑にかからず、極端な崖・山でない所（斜面はよい）。Lp=道の先端（その手前の道は無視する）
  const n=Math.max(2,Math.ceil(2*half/11)),st=2*half/n,G={};let lo=1e9,hi=-1e9;
  for(let i=0;i<=n;i++)for(let j=0;j<=n;j++){
    const a=-half+i*st,b=-half+j*st;if(round&&a*a+b*b>half*half*1.04)continue;
    const qx=cx+a*c+b*sn,qz=cz-a*sn+b*c,hh=hf(qx,qz);
    if(hh<WATER+2.5||(!v.port&&riverEff(qx,qz)<10)||netDist(net,qx,qz,[Lp[0],Lp[1],16])<8)return false;
    lo=Math.min(lo,hh);hi=Math.max(hi,hh);G[i+','+j]=hh;
  }
  for(const k in G){const[i,j]=k.split(',').map(Number),g0=G[k],g1=G[(i+1)+','+j],g2=G[i+','+(j+1)];
    if((g1!==undefined&&Math.abs(g1-g0)>9)||(g2!==undefined&&Math.abs(g2-g0)>9))return false}   // 隣り合う点（約11m）で9m以上の高低差＝断崖は避ける
  return hi-lo<=16;                                             // 斜面でもよい。極端な崖・山（全体で16m超の高低差）だけ避ける
}
function villageCastle(v,ends,hf,prob){                          // v=村/港町。ends=[{p:[x,z],th}] 道の先の候補（向きth）。条件が合えば道を伸ばし、v.castle と v.roads を足す
  if(!ends||!ends.length)return;
  const e0=ends[0].p,r=mulberry(hash(Math.round(e0[0]),Math.round(e0[1]),SEED+9393)*1e9|0);
  if(r()>(prob===undefined?.6:prob))return;
  const net=v.roads.map(s=>[[s[0],s[1]],[s[2],s[3]]]),E=ends[Math.floor(r()*ends.length)];
  const cseed=1+Math.floor(r()*999999),kinds=r()<CASTLE_LAND_P?['land','simple']:['simple'];
  const plan=kinds[0]==='land'?castleLandBuild({seed:cseed,plan:true}):null;   // land の大きさ・階段の向き（地形に関係なく種から決まる）
  for(let t=0;t<6;t++){
    const s0=E.p,th0=E.th+(t?(r()-.5)*1.2:0),maxLen=42+r()*54,pl=[[s0[0],s0[1]]];
    let th=th0,x=s0[0],z=s0[1],h=hf(x,z),len=0;
    while(len<maxLen){                                           // 地形に沿って（高低差の小さい向きを選んで）少し伸ばす
      let best=null,bc=1e9;
      for(let k=-3;k<=3;k++){
        const a=th+k*.21,qx=x+Math.cos(a)*VST,qz=z+Math.sin(a)*VST;
        if(Math.abs(Math.atan2(Math.sin(a-th0),Math.cos(a-th0)))>.9)continue;
        const hq=hf(qx,qz);if(hq<WATER+1.8||Math.abs(hq-h)>VDH*2)continue;
        if(!v.port&&riverEff(qx,qz)<9)continue;
        if(netDist(net.concat([pl]),qx,qz,[s0[0],s0[1],VGAP*1.4])<VGAP||villageSep(qx,qz)<60)continue;
        const cost=Math.abs(hq-h)*2.5+Math.abs(k)*.45+r()*.5;if(cost<bc){bc=cost;best=[a,qx,qz,hq]}
      }
      if(!best)break;
      th=best[0];x=best[1];z=best[2];h=best[3];pl.push([x,z]);len+=VST;
    }
    if(pl.length<6)continue;                                     // 36m以上伸ばせた時だけ
    const Lp=pl[pl.length-1],Pp=pl[pl.length-2],dd=Math.hypot(Lp[0]-Pp[0],Lp[1]-Pp[1])||1,ux=(Lp[0]-Pp[0])/dd,uz=(Lp[1]-Pp[1])/dd;
    for(const kind of kinds){
      let cx,cz,ry,half,sl=0;
      if(kind==='land'){
        half=plan.R;                                             // 一番下の段の階段が道（-u の向き）を向くように回す
        const wx=-ux,wz=-uz;ry=Math.atan2(plan.dz*wx-plan.dx*wz,plan.dx*wx+plan.dz*wz);
        sl=8;                                                    // 階段の長さ（段数に合わせて調整: 地形の高さから見積もる）
        for(let it=0;it<3;it++){
          cx=Lp[0]+ux*(plan.dS+sl+1.5);cz=Lp[1]+uz*(plan.dS+sl+1.5);
          let mxe=hf(cx,cz);for(let k=0;k<8;k++){const a=k*Math.PI/4;mxe=Math.max(mxe,hf(cx+Math.cos(a)*half*.8,cz+Math.sin(a)*half*.8))}
          const fy=hf(Lp[0]+ux*1.5,Lp[1]+uz*1.5),hh=Math.max(2.6,mxe+plan.stepH-fy);
          sl=Math.min(16,Math.max(6,Math.ceil(hh/.42)*.55));
        }
        cx=Lp[0]+ux*(plan.dS+sl+1.5);cz=Lp[1]+uz*(plan.dS+sl+1.5);
        if(hf(Lp[0]+ux*1.5,Lp[1]+uz*1.5)<WATER+1.5)continue;
      }else{
        half=VCW/2;cx=Lp[0]+ux*(half+6);cz=Lp[1]+uz*(half+6);ry=Math.atan2(-ux,-uz);   // 門（局所+z）を道へ向ける
      }
      const c=Math.cos(ry),sn=Math.sin(ry),W=(a,b)=>[cx+a*half*c+b*half*sn,cz-a*half*sn+b*half*c];
      if(!castleSite(v,net,Lp,cx,cz,half,c,sn,kind==='land',hf))continue;   // 平らでなくてよい。水・道・畑にかからず、極端な崖・山でない所
      const fr=kind==='land'?.72:1;
      if(villageSep(cx,cz)<(kind==='land'?half+12:45)||hitField([W(-fr,-fr),W(fr,-fr),W(fr,fr),W(-fr,fr)],v.fields||[]))continue;
      for(let i=0;i+1<pl.length;i++)v.roads.push([pl[i][0],pl[i][1],pl[i+1][0],pl[i+1][1]]);
      if(kind==='land'){
        v.roads.push([Lp[0],Lp[1],cx-ux*plan.dS,cz-uz*plan.dS]);   // 階段の下まで
        v.castle={kind:'land',x:cx,z:cz,ry,w:2*half,d:2*half,seed:cseed,sj:plan.sj,sl,R:half};
      }else{
        v.roads.push([Lp[0],Lp[1],cx+ux*half,cz+uz*half]);          // 城の門まで
        v.castle={kind:'simple',x:cx,z:cz,ry,w:VCW,d:VCW};
      }
      return;
    }
  }
}
function castleLandBuild(K,HT){
  const seed=K.seed,PLAN=!!K.plan;
  const rnd=mulberry(seed),TAU=Math.PI*2;
  const G=PLAN?0:K.G;                                                     // 地面の高さ（斜面では城の敷地の最高点）
  // ケーキの段: 下の段より小さく、少しずらして重ねる（大きさ・段差は seed で変動）
  const ONE_P=.35,nT=mulberry((seed*7+3)|0)()<ONE_P?1:2,TH=1.4,WH=1.8,tiers=[];   // 城壁が一段だけになる確率 35%（それ以外は二段）
  const r1=(nT===1?22:30)+rnd()*(nT===1?8:10);                            // 一番下の段の半径 二段:30〜40m / 一段:22〜30m（頂上が広くなりすぎないように）
  const R_TOP_MIN=15;                                                     // 上の段の半径の下限(m)＝小さくなりすぎない   // TH=城壁の厚み / WH=城壁が段の上面より高い分
  let cx=0,cz=0,r=r1,y=G;
  const SQ_P=.4,SQK=.92;                                                  // 四角い段になる確率 / 四角の半辺＝半径×SQK
  const tierR=(t,th)=>t.sq?t.r*SQK/Math.max(Math.abs(Math.cos(th-t.rot)),Math.abs(Math.sin(th-t.rot))):t.r*Math.min(1.12,Math.max(.88,1+(fbm(Math.cos(th)*1.5+t.ox,Math.sin(th)*1.5+t.oy)-.48)*.6));   // 段の輪郭（波打つ円）
  const gapOf=(u,p)=>{let g=1e9;for(let k=0;k<72;k++){const th=k/72*TAU,x=u.cx+Math.cos(th)*tierR(u,th),z=u.cz+Math.sin(th)*tierR(u,th),dx=x-p.cx,dz=z-p.cz;g=Math.min(g,tierR(p,Math.atan2(dz,dx))-TH-Math.hypot(dx,dz))}return g};
  for(let k=0;k<nT;k++){
    const stepH=2.6+rnd()*3.2;                                            // 段差 2.6〜5.8m
    y+=stepH;
    const t={cx,cz,r,y,y0:k?tiers[k-1].y-.3:(PLAN?G-.6:K.ymin),ox:rnd()*50,oy:rnd()*50,sq:rnd()<SQ_P,rot:rnd()*TAU};
    t.cj=t.sq?[0,1,2,3].map(c=>Math.round(((t.rot+Math.PI/4+c*Math.PI/2)%TAU+TAU)%TAU/TAU*48)%48):[];   // 四角の角にいちばん近い頂点の番号
    if(k>0){                                                              // 隙間が GAP 以上になるまで、上の段を小さく・中心寄りにする（下限あり）
      const p=tiers[k-1],a=rnd()*TAU,minR=Math.max(R_TOP_MIN,p.r*.5),GAP=Math.max(4,stepH*.95+1.2);   // 段差が高いほど階段が長いので隙間も広く
      let nr=Math.max(minR,p.r*(.65+rnd()*.15)),off=rnd()*p.r*.2;
      for(let it=0;it<80;it++){t.r=nr;t.cx=p.cx+Math.cos(a)*off;t.cz=p.cz+Math.sin(a)*off;if(gapOf(t,p)>=GAP||nr<=minR)break;nr=Math.max(minR,nr*.97);off*=.9}
      const maxH=(gapOf(t,p)-1.2)/.95;                                    // 隙間が足りないときは段差を低くして階段が収まるようにする
      if(stepH>maxH){t.y=p.y+Math.max(2.6,maxH);y=t.y}
    }
    tiers.push(t);
  }
  const GB=PLAN?[.42,.62,.25]:K.gc;                                      // 敷地の地面の色（その場所の地形の色）
  const topColor=(h,tn,x,z)=>{                                            // 地面の色（面ごとのむら）
    const n=vnoise(x*.09+5,z*.09-8)-.5,n2=vnoise(x*.8,z*.8)-.5,k=1+.3*n+.14*n2;
    return[GB[0]*k,GB[1]*k,GB[2]*k];
  };
  const wallColor=(i,x,z)=>{                                             // 砂岩の石積み（段ごとに明暗が交互）
    const n2=vnoise(x*.7+i*.3,z*.7)-.5,d=(i%2?.93:1.03)*(1+.14*n2);
    return[.62*d,.62*d,.6*d];
  };
  // 三角形ごとに頂点を持つ（頂点共有なし）＝面の法線と色が1つ＝ローポリ
  const pos=[],col=[],CIRC=[];
  const FH=(gx,gz)=>HT(K.x+gx*K.c+gz*K.s,K.z-gx*K.s+gz*K.c);          // 城の局所座標 → 地形の高さ
  // 色褪せ: 単色の部分（建物・屋根・塔・城壁など）の色を、彩度を落として白っぽく褪せさせ、場所ごとの汚れ・むらを付ける。草や地面（raw=1）はそのまま
  const fadeCol=(k,x,y,z)=>{
    const L=k[0]*.3+k[1]*.59+k[2]*.11,s=.6,n=vnoise(x*.35+y*.55+7,z*.35-y*.3)-.5,n2=vnoise(x*1.3+3,z*1.3+y*1.1)-.5,m=1+.34*n+.12*n2,f=.14*Math.min(1,L*2);   // 暗い色（窓）は褪せさせすぎない
    return[(L+(k[0]-L)*s)*m*(1-f)+.74*f,(L+(k[1]-L)*s)*m*(1-f)+.72*f,(L+(k[2]-L)*s)*m*(1-f)+.66*f];
  };
  const tri=(a,b,c,k,raw)=>{if(!raw)k=fadeCol(k,(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3);pos.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);for(let i=0;i<3;i++)col.push(k[0],k[1],k[2])};
  const normalOf=(a,b,c)=>{const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;return[nx/l,ny/l,nz/l]};
  const top=(a,b,c)=>{                                                    // 上面の三角形（上向きに揃える）
    let n=normalOf(a,b,c);if(n[1]<0){const t=b;b=c;c=t;n=[-n[0],-n[1],-n[2]]}
    const ny=Math.max(.05,n[1]);
    tri(a,b,c,topColor((a[1]+b[1]+c[1])/3,Math.sqrt(1-ny*ny)/ny,(a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3),1);
  };
  const faceOut=(a,b,c,ox,oz,colf)=>{                                     // 壁の三角形（中心(ox,oz)から見て外向きに揃える）
    const n=normalOf(a,b,c),x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;
    if(n[0]*(x-ox)+n[2]*(z-oz)<0){const t=b;b=c;c=t}
    tri(a,b,c,colf((a[1]+b[1]+c[1])/3,x,z));
  };
  // --- 城壁の部品（箱・円柱・円錐）。どれも凸な形なので「中心から外向き」に面の向きを揃える ---
  const STONE=[.62,.62,.6],MER=[.73,.73,.71],DARK=[.16,.1,.07],BLUE=[.2,.42,.7],LT=[.9,.89,.84];   // LT=塔の窓枠・窓台の明るい石色
  const ROOFC=mulberry((seed*91+5)|0)()<.5?BLUE:[.62,.28,.2];             // 屋根の色（館・城壁の塔・四隅の塔で共通）
  const triOut=(a,b,c,ctr,k)=>{
    const n=normalOf(a,b,c);
    if(n[0]*((a[0]+b[0]+c[0])/3-ctr[0])+n[1]*((a[1]+b[1]+c[1])/3-ctr[1])+n[2]*((a[2]+b[2]+c[2])/3-ctr[2])<0)tri(a,c,b,k);else tri(a,b,c,k);
  };
  const box=(cx,cy,cz,tx,tz,sx,sy,sz,k)=>{                                // 中心・水平の向き(tx,tz)・横幅sx・高さsy・奥行sz
    const nx=-tz,nz=tx,P=[],c0=[cx,cy,cz];
    for(const a of[-1,1])for(const b of[-1,1])for(const c of[-1,1])P.push([cx+tx*a*sx/2+nx*c*sz/2,cy+b*sy/2,cz+tz*a*sx/2+nz*c*sz/2]);
    for(const f of[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]]){triOut(P[f[0]],P[f[1]],P[f[2]],c0,k);triOut(P[f[0]],P[f[2]],P[f[3]],c0,k)}
  };
  const prism=(cx,cz,y0,y1,r,k)=>{                                        // 8角柱（側面＋上面）
    const S=8,ctr=[cx,(y0+y1)/2,cz],P=[];
    for(let i=0;i<S;i++){const an=i/S*TAU+.39;P.push([cx+Math.cos(an)*r,cz+Math.sin(an)*r])}
    for(let i=0;i<S;i++){
      const p=P[i],q=P[(i+1)%S];
      triOut([p[0],y0,p[1]],[q[0],y0,q[1]],[q[0],y1,q[1]],ctr,k);triOut([p[0],y0,p[1]],[q[0],y1,q[1]],[p[0],y1,p[1]],ctr,k);triOut([cx,y1,cz],[p[0],y1,p[1]],[q[0],y1,q[1]],ctr,k);
    }
  };
  const cone=(cx,cz,y1,r,h,k)=>{                                          // 8角錐の屋根
    const S=8,ctr=[cx,y1+h*.3,cz];
    for(let i=0;i<S;i++){const a1=i/S*TAU+.39,a2=(i+1)/S*TAU+.39;triOut([cx+Math.cos(a1)*r,y1,cz+Math.sin(a1)*r],[cx+Math.cos(a2)*r,y1,cz+Math.sin(a2)*r],[cx,y1+h,cz],ctr,k)}
  };
  const crenTower=(px,pz,yb,top,r,ya,rf)=>{                                  // 胸壁つきの塔（屋根なし）: 柱＋少し張り出した帯＋歯形の胸壁＋アーチ窓
    prism(px,pz,yb,top,r,STONE);prism(px,pz,top,top+.8,r+.32,MER);
    const R2=r+.32,ap=R2*Math.cos(Math.PI/8),mw=Math.min(1.1,2*R2*Math.sin(Math.PI/8)*.6);
    for(let i=0;i<8;i++){const an=i/8*TAU+.39+Math.PI/8,c=Math.cos(an),s=Math.sin(an);box(px+c*(ap-.3),top+.8+.5,pz+s*(ap-.3),-s,c,mw,1,.55,MER)}
    const ctr=[px,(yb+top)/2,pz],aw=Math.cos(Math.PI/8)*r,nw=top-ya>=2.6?2+Math.floor(rf()*2):0;
    for(let k=0;k<nw;k++){                                                  // アーチ窓: 高さ・向きはランダム
      const an=Math.floor(rf()*8)/8*TAU+.39+Math.PI/8,c=Math.cos(an),s=Math.sin(an),y=ya+(top-1.9-ya)*rf(),ww=.6,hh=1.2;
      const P=(u,yy)=>[px+c*(aw+.04)-s*u,yy,pz+s*(aw+.04)+c*u],PF=(u,yy)=>[px+c*(aw+.015)-s*u,yy,pz+s*(aw+.015)+c*u];
      const fp=[PF(-ww/2-.16,y-.14),PF(ww/2+.16,y-.14),PF(ww/2+.16,y+hh*.68),PF(0,y+hh+.22),PF(-ww/2-.16,y+hh*.68)];for(let i=1;i<4;i++)triOut(fp[0],fp[i],fp[i+1],ctr,LT);   // アーチ窓の枠
      {const sp=[px+c*(aw+.12),y-.1,pz+s*(aw+.12)];box(sp[0],sp[1],sp[2],-s,c,ww+.5,.14,.3,LT)}                                                                         // 窓台
      const pts=[P(-ww/2,y),P(ww/2,y),P(ww/2,y+hh*.68),P(0,y+hh),P(-ww/2,y+hh*.68)];
      for(let i=1;i<4;i++)triOut(pts[0],pts[i],pts[i+1],ctr,DARK);
    }
  };
  const sqTower=(px,pz,yb,top,hs,ya,rf,tx,tz,cren,rc,ch)=>{                    // 四角くて太い塔（柱＋張り出した帯＋胸壁 or 四角錐の屋根＋アーチ窓）。(tx,tz)=辺の向き
    const nx=-tz,nz=tx,S=2*hs+.6,ctr=[px,(yb+top)/2,pz],faces=[[nx,nz],[tx,tz],[-nx,-nz],[-tx,-tz]];
    box(px,(yb+top)/2,pz,tx,tz,2*hs,top-yb,2*hs,STONE);
    box(px,top+.4,pz,tx,tz,S,.8,S,MER);
    if(cren){
      const n=Math.max(3,Math.round(S/1.6));
      for(const[ox,oz]of faces)for(let i=0;i<n;i++){const u=-S/2+S*(i+.5)/n;box(px+ox*(S/2-.3)-oz*u,top+1.3,pz+oz*(S/2-.3)+ox*u,-oz,ox,S/n*.55,1,.6,MER)}
    }else{
      const hb=hs+.4,ap=[px,top+.8+ch,pz],rc2=[px,top+.8+ch*.3,pz],Cn=[[1,1],[-1,1],[-1,-1],[1,-1]].map(([a,b])=>[px+tx*a*hb+nx*b*hb,top+.8,pz+tz*a*hb+nz*b*hb]);
      for(let i=0;i<4;i++)triOut(Cn[i],Cn[(i+1)%4],ap,rc2,rc);
    }
    const nw=top-ya>=2.6?2+Math.floor(rf()*2):0;
    for(let k=0;k<nw;k++){                                                  // アーチ窓: 高さ・向き・位置はランダム
      const[ox,oz]=faces[Math.floor(rf()*4)],u=(rf()-.5)*hs*.9,y=ya+(top-1.9-ya)*rf(),ww=.8,hh=1.5;
      const P=(uu,yy)=>[px+ox*(hs+.04)-oz*(u+uu),yy,pz+oz*(hs+.04)+ox*(u+uu)],PF=(uu,yy)=>[px+ox*(hs+.015)-oz*(u+uu),yy,pz+oz*(hs+.015)+ox*(u+uu)];
      const fp=[PF(-ww/2-.18,y-.16),PF(ww/2+.18,y-.16),PF(ww/2+.18,y+hh*.68),PF(0,y+hh+.25),PF(-ww/2-.18,y+hh*.68)];for(let i=1;i<4;i++)triOut(fp[0],fp[i],fp[i+1],ctr,LT);   // アーチ窓の枠
      {const sp=[px+ox*(hs+.12)-oz*u,y-.12,pz+oz*(hs+.12)+ox*u];box(sp[0],sp[1],sp[2],-oz,ox,ww+.6,.14,.3,LT)}                                                          // 窓台
      const pts=[P(-ww/2,y),P(ww/2,y),P(ww/2,y+hh*.68),P(0,y+hh),P(-ww/2,y+hh*.68)];
      for(let i=1;i<4;i++)triOut(pts[0],pts[i],pts[i+1],ctr,DARK);
    }
    return top+.8+(cren?0:ch);                                              // 屋根の先の高さ（旗用）
  };
  const quadOut=(a,b,c,d,ox,oz,k,s)=>{                                      // 壁の四角形（中心(ox,oz)から見て外向き・1色）
    for(const f of[[a,b,c],[a,c,d]]){
      const n=normalOf(f[0],f[1],f[2]),x=(f[0][0]+f[1][0]+f[2][0])/3,z=(f[0][2]+f[1][2]+f[2][2])/3;
      if((s||1)*(n[0]*(x-ox)+n[2]*(z-oz))<0)tri(f[0],f[2],f[1],k);else tri(f[0],f[1],f[2],k);
    }
  };
  // --- ケーキの段: 平らな上面 ＋ 垂直に近い壁 ---
  const ST=48,RT=4;
  for(let ti=0;ti<nT;ti++){
    const t=tiers[ti],rows=[[[t.cx,t.y,t.cz]]];
    for(let i=1;i<=RT;i++){
      const row=[];
      for(let j=0;j<ST;j++){
        const rm=i===RT,ci=t.cj.indexOf(j),th=ci>=0?t.rot+Math.PI/4+ci*Math.PI/2:(j+(rm?0:(hash(i,j,seed+11)-.5)*.5)/1)/ST*TAU,f=rm?1:i/RT+(hash(i,j,seed+12)-.5)*.3/RT,rr=f*tierR(t,th);
        row.push([t.cx+rr*Math.cos(th),t.y,t.cz+rr*Math.sin(th)]);
      }
      rows.push(row);
    }
    for(let j=0;j<ST;j++)top(rows[0][0],rows[1][j],rows[1][(j+1)%ST]);
    for(let i=1;i<RT;i++)for(let j=0;j<ST;j++){
      const j2=(j+1)%ST,a=rows[i][j],b=rows[i][j2],c=rows[i+1][j2],d=rows[i+1][j];
      if(hash(i,j,seed+13)<.5){top(a,b,c);top(a,c,d)}else{top(a,b,d);top(b,c,d)}
    }
    // 城壁: 段の上面より WH だけ高く立ち上げる（厚み TH・上は通路、内側にも壁面）。縁に胸壁、等間隔に塔、1か所に階段（壁を切って上の段まで上がる）
    const yw=t.y+WH,rt=rows[RT],NR=Math.max(2,Math.ceil((yw-t.y0)/1)),lv=[];
    for(let i=0;i<=NR;i++){
      const yy=t.y0+(yw-t.y0)*i/NR,row=[];
      for(let j=0;j<ST;j++){
        const x=rt[j][0],z=rt[j][2],l=Math.hypot(x-t.cx,z-t.cz)||1,e=(i===0||i===NR)?0:(hash(j,i,seed+14)-.5)*.25;
        row.push([x+(x-t.cx)/l*e,yy,z+(z-t.cz)/l*e]);
      }
      lv.push(row);
    }
    const inT=[],inB=[];                                                  // 壁の内側の縁（上=通路の内端 / 下=段の上面）
    for(let j=0;j<ST;j++){
      const x=rt[j][0],z=rt[j][2],l=Math.hypot(x-t.cx,z-t.cz)||1,ix=x-(x-t.cx)/l*TH,iz=z-(z-t.cz)/l*TH;
      inT.push([ix,yw,iz]);inB.push([ix,t.y,iz]);
    }
    const nxt=tiers[ti+1],covered=(x,z,m)=>nxt&&Math.hypot(x-nxt.cx,z-nxt.cz)<tierR(nxt,Math.atan2(z-nxt.cz,x-nxt.cx))+m;   // 上の段に隠れる所には置かない
    // 階段の位置: 塔のない場所（j%8==4,5）のうち、壁の外側に広い空間がある所（下の段の城壁にぶつからない所）
    const midOf=j=>{
      const a=rt[j],c=rt[j+2],mx=(a[0]+c[0])/2,mz=(a[2]+c[2])/2,l=Math.hypot(mx-t.cx,mz-t.cz)||1;
      if(t.sq){let nx=-(c[2]-a[2]),nz=c[0]-a[0];const nl=Math.hypot(nx,nz)||1;nx/=nl;nz/=nl;if(nx*(mx-t.cx)+nz*(mz-t.cz)<0){nx=-nx;nz=-nz}return[mx,mz,nx,nz]}   // 四角は壁面に垂直
      return[mx,mz,(mx-t.cx)/l,(mz-t.cz)/l]};
    const clearAt=j=>{                                                    // 壁の外へ、下の段の城壁の内側までの距離
      if(ti===0)return 60;
      const p=tiers[ti-1],m=midOf(j);let d=0;
      while(d<60){const x=m[0]+m[2]*d,z=m[1]+m[3]*d;if(Math.hypot(x-p.cx,z-p.cz)>tierR(p,Math.atan2(z-p.cz,x-p.cx))-TH-.8)break;d+=.25}
      return d;
    };
    if(PLAN&&ti===0){                                                     // 配置の下見: 階段の向き・城の大きさだけ返す（道の向きに階段を合わせるため）
      const cand=[];for(let q=0;q<6;q++){if(t.cj.some(c=>c>=4+8*q-1&&c<=4+8*q+3))continue;cand.push(4+8*q)}
      const sj=cand.length?cand[Math.floor(mulberry((seed*29+7)|0)()*cand.length)]:4,m=midOf(sj);
      let RR=0;for(let j=0;j<ST;j++)RR=Math.max(RR,Math.hypot(rt[j][0]-t.cx,rt[j][2]-t.cz));
      return{nT,sj,dS:Math.hypot(m[0]-t.cx,m[1]-t.cz),dx:m[2],dz:m[3],R:RR+4,stepH:t.y-G};
    }
    let stairJ=4,bc=-1;
    for(let q=0;q<6;q++){if(t.cj.some(c=>c>=4+8*q-1&&c<=4+8*q+3))continue;const sc=clearAt(4+8*q)+rnd()*3;if(sc>bc){bc=sc;stairJ=4+8*q}}
    if(ti===0&&K.sj!==undefined)stairJ=K.sj;                              // 一番下の段の階段は道のほうへ向ける（向きは配置時に決めた）
    if(ti===0){for(let j=0;j<ST;j++){const a=rt[j],b=rt[(j+1)%ST],dd=Math.hypot(b[0]-a[0],b[2]-a[2]),nn=Math.max(1,Math.ceil(dd/2));for(let q=0;q<nn;q++){const f=q/nn;CIRC.push([a[0]+(b[0]-a[0])*f,a[2]+(b[2]-a[2])*f,2.6])}}}   // 当たり判定: 一番下の城壁のまわり
    const cut=j=>j===stairJ||j===stairJ+1;
    for(let i=0;i<NR;i++)for(let j=0;j<ST;j++)if(!cut(j))quadOut(lv[i+1][j],lv[i+1][(j+1)%ST],lv[i][(j+1)%ST],lv[i][j],t.cx,t.cz,wallColor(i,lv[i][j][0],lv[i][j][2]));
    for(let j=0;j<ST;j++){
      if(cut(j))continue;
      const j2=(j+1)%ST;
      for(const f of[[lv[NR][j],lv[NR][j2],inT[j2]],[lv[NR][j],inT[j2],inT[j]]]){                       // 通路の上面（上向き）
        const n=normalOf(f[0],f[1],f[2]);if(n[1]<0)tri(f[0],f[2],f[1],MER);else tri(f[0],f[1],f[2],MER);
      }
      quadOut(inT[j],inT[j2],inB[j2],inB[j],t.cx,t.cz,[.54,.54,.53],-1);                                // 内側の壁面（中心向き）
    }
    {                                                                     // 階段: 壁の切れ目の外側に、段の上面の高さまで上がる石の階段（幅は壁2区画ぶん）
      const j=stairJ,a=rt[j],c=rt[j+2],W=Math.hypot(c[0]-a[0],c[2]-a[2])||1,tx=(c[0]-a[0])/W,tz=(c[2]-a[2])/W,m=midOf(j);
      t.sdir=[m[2],m[3]];const yb=ti===0?Math.min(t.y-2,FH(m[0]+m[2]*K.sl,m[1]+m[3]*K.sl)):t.y0+.3,h=t.y-yb,n=Math.max(3,Math.ceil(h/.42)),run=ti===0?Math.max(.2,Math.min(1.2,K.sl/n)):Math.max(.3,Math.min(.7,(clearAt(j)-.5)/n)),SK=[[.72,.72,.7],[.66,.66,.64]];
      for(let i=0;i<n;i++){                                               // 下の段から i 番目。地面の下まで埋めて浮かないようにする
        const top=yb+h*(i+1)/n,d=(n-1-i+.5)*run;
        const yl=ti===0?Math.min(yb-3,K.ymin):yb-3;                       // 斜面でも浮かないよう、一番低い地面の下まで埋める
        box(m[0]+m[2]*d,(top+yl)/2,m[1]+m[3]*d,tx,tz,W,top-yl,run,SK[i%2]);
      }
      if(ti===0)for(let d=0;d<=K.sl+1;d+=2)for(let u=-W/2;u<=W/2+.01;u+=2)CIRC.push([m[0]+m[2]*d+tx*u,m[1]+m[3]*d+tz*u,2.4]);   // 当たり判定: 階段（登れない）
      for(const[vj,sg]of[[j,-1],[j+2,1]]){                                // 切れ目の両側の断面（壁の厚み）
        const o=lv[NR][vj],ib=inB[vj],it=inT[vj],ob=[rt[vj][0],t.y,rt[vj][2]],cc=[(o[0]+ib[0])/2+tx*sg*5,(t.y+yw)/2,(o[2]+ib[2])/2+tz*sg*5];
        triOut(ob,o,it,cc,[.55,.55,.54]);triOut(ob,it,ib,cc,[.55,.55,.54]);
      }
    }
    for(let j=0;j<ST;j++){
      const j2=(j+1)%ST,a=rt[j],b=rt[j2],mx=(a[0]+b[0])/2,mz=(a[2]+b[2])/2,L=Math.hypot(b[0]-a[0],b[2]-a[2])||1,tx=(b[0]-a[0])/L,tz=(b[2]-a[2])/L;
      const rl=Math.hypot(mx-t.cx,mz-t.cz)||1,ux=(mx-t.cx)/rl,uz=(mz-t.cz)/rl;
      const isTw=t.sq?(t.cj.includes(j)||(j%8===0&&t.cj.every(c=>Math.min((j-c+ST)%ST,(c-j+ST)%ST)>=3))):j%8===0;   // 四角は角に塔
      if(isTw&&!covered(a[0],a[2],2.2)){                               // 塔（壁より高く、壁から少しはみ出す）
        const al=Math.hypot(a[0]-t.cx,a[2]-t.cz)||1,px=a[0]+(a[0]-t.cx)/al*.2,pz=a[2]+(a[2]-t.cz)/al*.2;
        const hv=k=>hash(j*13+k,ti+5,seed+31);
        if(hv(0)<.3){let n=1;crenTower(px,pz,t.y0,yw+3+hv(9)*2.2,1.9,yw+.3,()=>hv(n++))}   // 30%: 胸壁つきの丸い塔
        else if(hv(0)<.55&&!covered(a[0],a[2],3.4)){                        // 25%: 四角くて太い塔（胸壁 or 四角錐の屋根）
          let n=1;const q0=rt[(j+ST-1)%ST],q1=rt[(j+1)%ST],ql=Math.hypot(q1[0]-q0[0],q1[2]-q0[2])||1;
          sqTower(px,pz,t.y0,yw+3+hv(9)*2.2,2.3,yw+.3,()=>hv(n++),(q1[0]-q0[0])/ql,(q1[2]-q0[2])/ql,hv(8)<.5,ROOFC,2.4+hv(7)*.8);
        }
        else{prism(px,pz,t.y0,yw+2.4,1.9,STONE);prism(px,pz,yw+2.4,yw+3.1,2.25,MER);cone(px,pz,yw+3.1,2.4,2.6,ROOFC)}
      }else if(!cut(j)&&j%2===0&&!covered(mx,mz,1.2)){                    // 胸壁（通路の外側に載せる）
        box(mx-ux*.55,yw+.6,mz-uz*.55,tx,tz,L*.7,1.2,.9,MER);
      }
    }
  }

  // --- 一番上の段のメインの建物: 切妻屋根の館。正面（破風側）がその段の階段のほうを向く。大きさ・屋根の出っ張り(ドーマー)の数と大きさはランダム ---
  const tp0=tiers[nT-1];let pr0=1e9;for(let k=0;k<72;k++)pr0=Math.min(pr0,tierR(tp0,k/72*TAU));pr0=Math.max(3,pr0-TH-.3);
  const bld=(()=>{
    const fort=mulberry((seed*17+11)|0)()<.35;                                            // 要塞タイプ（平らな屋根に胸壁）になる確率 35%。正面は長い壁側
    const wide=rnd()<.4||fort;                                                            // 横長タイプ（正面が長い壁側）になる確率 40%
    const f0x=(tp0.sdir||[1,0])[0],f0z=(tp0.sdir||[1,0])[1];                            // 階段側の向き
    const fx=wide?-f0z:f0x,fz=wide?f0x:f0z,sx=-fz,sz=fx;                                  // (fx,fz)=棟の向き（縦長は正面と同じ／横長は正面に直角）
    const maxD=Math.max(5,pr0*.8-.3),D=maxD*(.85+.15*rnd()),ar=fort?1+rnd()*.2:1.25+rnd()*.7;           // 対角の半分 D が頂上の平地に収まる範囲でランダム
    const w=Math.min(16,2*D/Math.sqrt(1+ar*ar)),L=Math.min(26,w*ar),hw=w/2,hl=L/2;
    const bx=tp0.cx-f0x*pr0*.1,bz=tp0.cz-f0z*pr0*.1,y0=tp0.y;                              // 少し奥に置いて、正面に前庭を残す
    const dw=Math.min(3.4,Math.max(1.4,w*.3)),dh=dw*1.9,rr=Math.min(1.5,Math.max(.55,w*.11));
    const H=dh+.45+2*rr+.9+rnd()*.8,RH=hw*(.85+rnd()*.4);                                // 壁の高さ・屋根の高さ
    const wi=Math.floor(rnd()*3),WALL=[[.8,.74,.62],[.84,.82,.76],[.72,.66,.58]][wi],ROOF=(rnd(),ROOFC),ROOFD=ROOF.map(v=>v*.8);
    const TRIM=wi===1?[.38,.3,.24]:[.96,.94,.88];                                        // 窓枠・窓台・破風の縁取り色（壁が明るいときは濃い茶、それ以外はクリーム）
    const W=(a,y,b)=>[bx+sx*a+fx*b,y0+y,bz+sz*a+fz*b],ctr=W(0,(H+RH)/2,0);
    const Hf=H+Math.min(RH*.5,2.8);                                                                     // 要塞の壁の高さ（屋根がない分、館の軒より少し高い）
    const Q=(p,q,r,u,c,k)=>{triOut(p,q,r,c,k);triOut(p,r,u,c,k)};
    const fan=(pts,c,k)=>{for(let i=1;i<pts.length-1;i++)triOut(pts[0],pts[i],pts[i+1],c,k)};
    // 本体（五角形の柱）。壁・破風・屋根
    if(fort){box(bx,y0+(Hf-.5)/2,bz,fx,fz,L,Hf+.5,w,WALL)}                              // 要塞: 四角い箱
    else{
    const pent=b=>[W(-hw,-.5,b),W(hw,-.5,b),W(hw,H,b),W(0,H+RH,b),W(-hw,H,b)],pf=pent(hl),pb=pent(-hl);
    fan(pf,ctr,WALL);fan(pb,ctr,WALL);
    Q(pb[0],pf[0],pf[4],pb[4],ctr,WALL);Q(pb[1],pf[1],pf[2],pb[2],ctr,WALL);
    Q(pb[4],pf[4],pf[3],pb[3],ctr,ROOF);Q(pb[2],pf[2],pf[3],pb[3],ctr,ROOF);
    }
    // 軒の張り出し（屋根の板）
    const ex=.4,eaveY=fort?Hf-.25:H-ex*RH/hw+.12,apY=H+RH+.12;
    if(!fort)for(const sg of[-1,1])Q(W(sg*(hw+ex),eaveY,-hl-ex),W(sg*(hw+ex),eaveY,hl+ex),W(0,apY,hl+ex),W(0,apY,-hl-ex),ctr,ROOF);
    if(!fort)for(const sg of[-1,1])for(const e of[-1,1]){const bb=e*(hl+ex+.01);Q(W(sg*(hw+ex),eaveY,bb),W(0,apY,bb),W(0,apY-.45,bb),W(sg*(hw+ex),eaveY-.45,bb),ctr,TRIM)}   // 破風の縁取り（屋根の端の化粧板）
    // サイドの建物: 正面から見て左右それぞれ50%の確率で、メインの壁にぴったりくっつけて建てる（幅・奥行き・高さ・位置・窓はランダム）
    // 縦長（正面=破風側）→ 長い壁に直角の切妻 / 横長（正面=長い壁側）→ 左右の破風の壁に棟を伸ばす。屋根はメインの軒より低くする
    const tr=Math.min(1.6,Math.max(1,w*.13)),trm=tr*1.4;                                           // 四隅の塔の半径
    const bays=[],r4=mulberry((seed*211+13)|0);
    // 壁の出っ張り（出窓）: 壁の平らな面に、裏（壁側）は面を作らずぴったりくっつける。台形の張り出し＋屋根（要塞は平ら）＋アーチ窓と窓台
    const bay=(px,pz,nx,nz,tx,tz,wb,d,hmax,flat,rf)=>{                              // (px,pz)=壁の上の位置, n=壁の外向き, t=壁に沿う向き
      const rh=flat?0:wb*.42,hb=Math.min(hmax-rh-.1,hmax*(.55+.3*rf()));
      if(hb<1.8)return false;
      const yb=y0-.5,yt=y0+hb,wf=wb*.62,V=(u,r,y)=>[px+tx*u+nx*r,y,pz+tz*u+nz*r];
      const bl=V(-wb/2,0,yb),br=V(wb/2,0,yb),fl=V(-wf/2,d,yb),fr=V(wf/2,d,yb),blt=V(-wb/2,0,yt),brt=V(wb/2,0,yt),flt=V(-wf/2,d,yt),frt=V(wf/2,d,yt);
      const c=[px+nx*d*.5,(yb+yt)/2,pz+nz*d*.5];
      Q(fl,fr,frt,flt,c,WALL);Q(bl,fl,flt,blt,c,WALL);Q(br,fr,frt,brt,c,WALL);
      if(flat){const lc=[c[0],yt-1,c[2]];triOut(blt,brt,frt,lc,MER);triOut(blt,frt,flt,lc,MER)}
      else{const ap=V(0,d*.4,yt+rh),rc=[c[0],yt+rh*.3,c[2]];triOut(blt,flt,ap,rc,ROOF);triOut(flt,frt,ap,rc,ROOF);triOut(frt,brt,ap,rc,ROOF);triOut(brt,blt,ap,rc,ROOF)}
      const P=(u,y,o)=>[px+tx*u+nx*(d+.03+o),y,pz+tz*u+nz*(d+.03+o)],ww=Math.min(1.1,wf*.5),wb0=y0+hb*.35,hh=Math.min(1.7,hb*.45);
      const ar=(m,o,k,dy)=>{const p=[P(-ww/2*m,wb0-dy,o),P(ww/2*m,wb0-dy,o),P(ww/2*m,wb0+hh*.68,o),P(0,wb0+hh+dy,o),P(-ww/2*m,wb0+hh*.68,o)];for(let i=1;i<4;i++)triOut(p[0],p[i],p[i+1],c,k)};
      ar(1.3,0,STONE,.1);ar(1,.02,DARK,0);
      const sp=P(0,wb0-.12,.25);box(sp[0],sp[1],sp[2],tx,tz,ww*1.7,.16,.5,STONE);
      return true;
    };
    const ann=[];
    {
      const r2=mulberry((seed*131+7)|0),span=wide?w:L,Hmax=eaveY-.25;
      for(const sg of[-1,1]){
        const want=r2()<.5,p1=r2(),p2=r2(),p3=r2(),p4=r2(),p5=r2(),p6=r2(),p7=r2(),p8=r2();
        if(!want)continue;
        const avail=span-2*(trm+.3);                                                    // 四隅の塔を避けた壁の幅
        if(avail<2.4)continue;
        const wA=Math.min(avail,Math.max(2.4,avail*(.45+.5*p1))),hwA=wA/2,bc=(p2-.5)*Math.max(0,avail-wA),base=wide?hl:hw;
        const A=(q,y,r)=>wide?W(bc+q,y,sg*(base+r)):W(sg*(base+r),y,bc+q);          // q=幅方向, r=メインの壁から外への距離
        const fits=d=>[-1,1].every(s=>{const P=A(s*(hwA+.25),0,d+.25);return Math.hypot(P[0]-tp0.cx,P[2]-tp0.cz)<=pr0-.2});   // 頂上の平地に収める
        let dA=3+p3*3.5;
        while(dA>2.2&&!fits(dA))dA-=.25;
        if(!fits(dA))continue;
        let H2=Math.min(Hmax-.9,Math.max(2.4,H*(.45+.2*p4)));
        const RH2=Math.max(.8,Math.min(Hmax-H2,hwA*(.75+.35*p5)));H2=Math.min(H2,Hmax-RH2);
        const c2=A(0,(H2+RH2)/2,dA/2),pent2=r=>[A(-hwA,-.5,r),A(hwA,-.5,r),A(hwA,H2,r),A(0,H2+RH2,r),A(-hwA,H2,r)];
        const pf2=pent2(dA),pb2=pent2(0);
        fan(pf2,c2,WALL);                                                              // 外側の破風の壁（メイン側の面は作らない）
        Q(pb2[0],pf2[0],pf2[4],pb2[4],c2,WALL);Q(pb2[1],pf2[1],pf2[2],pb2[2],c2,WALL);
        const ox=.25,ey=H2-ox*RH2/hwA+.1,ay=H2+RH2+.1;
        for(const s of[-1,1])Q(A(s*(hwA+ox),ey,0),A(s*(hwA+ox),ey,dA+ox),A(0,ay,dA+ox),A(0,ay,0),c2,ROOF);
        // 外側の破風の窓（四角・アーチ・丸のどれか）
        const FA=(u,y,o)=>A(u,y,dA+.03+o),GL=[.35,.5,.65],ty=Math.floor(p6*3);
        const ww=Math.min(1.6,Math.max(.8,hwA*(.35+.3*p7))),wb=Math.max(.7,H2*.3),wh=Math.min(H2-wb-.5,1.1+p8*.9);
        const arch=(m,o,k,dy)=>fan([FA(-ww/2*m,wb-dy,o),FA(ww/2*m,wb-dy,o),FA(ww/2*m,wb+wh*.68,o),FA(0,wb+wh+dy,o),FA(-ww/2*m,wb+wh*.68,o)],c2,k);
        const ring=(R,o,k)=>{const P=[];for(let i=0;i<12;i++){const an=i/12*TAU;P.push(FA(Math.cos(an)*R,wb+wh/2+Math.sin(an)*R,o))}fan(P,c2,k)};
        if(ty===0){
          Q(FA(-ww/2-.15,wb-.15,0),FA(ww/2+.15,wb-.15,0),FA(ww/2+.15,wb+wh+.15,0),FA(-ww/2-.15,wb+wh+.15,0),c2,STONE);
          Q(FA(-ww/2,wb,.02),FA(ww/2,wb,.02),FA(ww/2,wb+wh,.02),FA(-ww/2,wb+wh,.02),c2,GL);
        }else if(ty===1){arch(1.3,0,STONE,.15);arch(1,.02,GL,0)}
        else{const R=Math.min(ww*.6,wh*.6+.1);ring(R+.15,0,STONE);ring(R,.02,GL)}
        Q(FA(-.04,wb-.1,.04),FA(.04,wb-.1,.04),FA(.04,wb+wh+.1,.04),FA(-.04,wb+wh+.1,.04),c2,DARK);   // 窓の桟
        // 側面の窓（数・幅はランダム）
        const nsw=Math.floor(dA/2.4);
        for(const s of[-1,1])for(let k=0;k<nsw;k++){
          if(r2()<.2)continue;
          const r=dA*(k+.5)/nsw,sw=.3+r2()*.25,a=s*(hwA+.03);
          {const a1=s*(hwA+.012),e=.12;Q(A(a1,wb-e,r-sw-e),A(a1,wb-e,r+sw+e),A(a1,wb+wh+e,r+sw+e),A(a1,wb+wh+e,r-sw-e),c2,TRIM)}   // 側面の窓枠
          Q(A(a,wb,r-sw),A(a,wb,r+sw),A(a,wb+wh,r+sw),A(a,wb+wh,r-sw),c2,DARK);
        }
        for(const s of[-1,1]){                                                        // サイドの建物の側面にも出窓（30%）
          if(r4()>=.3)continue;
          const wbv=1.2+r4()*.8,dv=.8+r4()*.4,lo=wbv/2+.5,hi=dA-wbv/2-.3;
          if(hi<=lo)continue;
          const rc=lo+(hi-lo)*r4(),P=A(s*hwA,0,rc),o0=A(0,0,0),qv=A(1,0,0),rv=A(0,0,1);
          if(bay(P[0],P[2],(qv[0]-o0[0])*s,(qv[2]-o0[2])*s,rv[0]-o0[0],rv[2]-o0[2],wbv,dv,H2-.5,false,r4))bays.push({k:'x',sg:0,u:0,wb:wbv});
        }
        ann.push({sg,bc,wA});
      }
    }
    // 四隅の塔: 城壁の塔と同じ作り（石の柱＋胸壁の張り出し＋青い円錐屋根）。高さは塔ごとにランダム
    {
      const r3=mulberry((seed*57+3)|0);
      const wa=hash(1,2,seed+51)*TAU,wx=Math.cos(wa),wz=Math.sin(wa),FLAG=ROOF===BLUE?[.82,.14,.12]:[.95,.8,.2],POLE=[.25,.2,.15];
      const flag=(px,pz,yt)=>{                                               // 円錐屋根の先に旗（ポール＋ゆらぎのある長方形。風向きは全部そろえる）
        box(px,yt+.85,pz,1,0,.1,1.7,.1,POLE);
        const yb=yt+1.65,pt=(i,h)=>{const l=Math.sin(i*1.6+px)*.13;return[px+wx*(.05+i*.5)-wz*l,yb-.75*h,pz+wz*(.05+i*.5)+wx*l]};
        for(let i=0;i<3;i++){const a=pt(i,0),b=pt(i+1,0),c=pt(i+1,1),d=pt(i,1);tri(a,b,c,FLAG);tri(a,c,b,FLAG);tri(a,c,d,FLAG);tri(a,d,c,FLAG)}
      };
      for(const sa of[-1,1])for(const sb of[-1,1]){
        const P=W(sa*hw,0,sb*hl),top=y0+(fort?Hf+1:H+.8)+r3()*(RH+2.5);
        const ch=2.2+r3()*.8,ty=r3(),sb2=r3()<.5;
        if(ty<.25)crenTower(P[0],P[2],y0-.5,top,tr,y0+1.2,r3);                       // 25%: 胸壁つきの丸い塔
        else if(ty<.5){const ap=sqTower(P[0],P[2],y0-.5,top,tr*1.35,y0+1.2,r3,fx,fz,sb2,ROOF,ch);if(!sb2)flag(P[0],P[2],ap)}   // 25%: 四角くて太い塔
        else{prism(P[0],P[2],y0-.5,top,tr,STONE);prism(P[0],P[2],top,top+.7,tr+.35,MER);cone(P[0],P[2],top+.7,tr+.4,ch,ROOF);flag(P[0],P[2],top+.7+ch)}
      }
    }
    {                                                                                 // メインの壁の出窓: 正面（扉の壁）以外の壁ごとに40%。サイドの建物・四隅の塔とは重ねない
      const walls=wide?[{k:'a',sg:1,len:L},{k:'b',sg:-1,len:w},{k:'b',sg:1,len:w}]:[{k:'a',sg:-1,len:L},{k:'a',sg:1,len:L},{k:'b',sg:-1,len:w}];
      for(const wl of walls){
        const p0=r4(),wbv=1.6+r4()*1.6,dv=1+r4()*.5;
        if(p0>=.4)continue;
        const hu=wl.len/2-(trm+.3)-wbv/2;if(hu<=0)continue;
        const an=ann.find(q=>q.sg===wl.sg&&(wide?wl.k==='b':wl.k==='a'));
        let u=null;
        for(let it=0;it<6&&u===null;it++){const cc=(r4()*2-1)*hu;if(!an||Math.abs(cc-an.bc)>an.wA/2+wbv/2+.4)u=cc}
        if(u===null)continue;
        const A0=wl.k==='a',P=A0?W(wl.sg*hw,0,u):W(u,0,wl.sg*hl),n=A0?[wl.sg*sx,wl.sg*sz]:[wl.sg*fx,wl.sg*fz],tg=A0?[fx,fz]:[sx,sz];
        if(bay(P[0],P[2],n[0],n[1],tg[0],tg[1],wbv,dv,eaveY-.5,fort,r4))bays.push({k:wl.k,sg:wl.sg,u,wb:wbv});
      }
    }
    // 正面: 階段・アーチ形の扉・放射状の丸窓（縦長は破風側、横長は長い壁側）
    const FP=(u,y,o)=>wide?W(-(hw+.03+o),y,u):W(u,y,hl+.03+o);                           // 正面の面上の点（u=横位置, o=手前への浮かし）
    if(wide)box(bx-f0x*(hw+.5),y0+.12,bz-f0z*(hw+.5),fx,fz,dw+1.2,.3,1.0,STONE);
    else box(bx+fx*(hl+.5),y0+.12,bz+fz*(hl+.5),sx,sz,dw+1.2,.3,1.0,STONE);
    const arch=(m,ww,hh,o,k)=>fan([FP(-ww/2*m,0,o),FP(ww/2*m,0,o),FP(ww/2*m,hh*.68,o),FP(0,hh,o),FP(-ww/2*m,hh*.68,o)],ctr,k);
    arch(1.28,dw,dh*1.08,0,STONE);arch(1,dw,dh,.02,DARK);
    const wy=dh+.45+rr,ring=(R,o,k)=>{const P=[];for(let i=0;i<12;i++){const an=i/12*TAU;P.push(FP(Math.cos(an)*R,wy+Math.sin(an)*R,o))}fan(P,ctr,k)};
    ring(rr+.16,0,STONE);ring(rr,.02,[.35,.5,.65]);
    for(let i=0;i<4;i++){const an=i/4*Math.PI,ca=Math.cos(an),sa=Math.sin(an),tw=.05;                                  // 丸窓の桟
      Q(FP(ca*rr-sa*tw,wy+sa*rr+ca*tw,.04),FP(-ca*rr-sa*tw,wy-sa*rr+ca*tw,.04),FP(-ca*rr+sa*tw,wy-sa*rr-ca*tw,.04),FP(ca*rr+sa*tw,wy+sa*rr-ca*tw,.04),ctr,DARK)}
    if(fort){
      // 要塞: 正面の扉の左右にアーチ窓（下に窓台）
      const fw=Math.min(1.3,Math.max(.8,w*.1)),fh=fw*1.7,fy=wy-fh*.45,u1=Math.min(hl-tr-1.2,Math.max(dw/2*1.28+fw/2+.9,L*.27));
      if(u1>dw/2*1.28+fw/2+.3)for(const s of[-1,1]){
        const u0=s*u1,ar2=(m,o,k,dy)=>fan([FP(u0-fw/2*m,fy-dy,o),FP(u0+fw/2*m,fy-dy,o),FP(u0+fw/2*m,fy+fh*.68,o),FP(u0,fy+fh+dy,o),FP(u0-fw/2*m,fy+fh*.68,o)],ctr,k);
        ar2(1.3,0,STONE,.12);ar2(1,.02,DARK,0);
        const sp=FP(u0,fy-.2,.3);box(sp[0],sp[1],sp[2],fx,fz,fw*1.7,.2,.6,STONE);
      }
      // 平らな屋根の縁に胸壁（歯形）をぐるっと並べる
      const sl=W(0,Hf+.06,0);box(sl[0],sl[1],sl[2],fx,fz,L,.12,w,MER);
      const nm=Math.max(3,Math.round(L/2.4)),nm2=Math.max(2,Math.round(w/2.4));
      for(const sg of[-1,1]){
        for(let i=0;i<nm;i++){const p=W(sg*(hw-.3),Hf+.62,-hl+L*(i+.5)/nm);box(p[0],p[1],p[2],fx,fz,L/nm*.55,1,.6,MER)}
        for(let i=0;i<nm2;i++){const p=W(-hw+w*(i+.5)/nm2,Hf+.62,sg*(hl-.3));box(p[0],p[1],p[2],sx,sz,w/nm2*.55,1,.6,MER)}
      }
    }
    // 長い壁の窓
    const nw=Math.max(1,Math.floor(L/3.2));
    for(const sg of[-1,1])for(let k=0;k<nw;k++){const b=-hl+L*(k+.5)/nw,a=sg*(hw+.03);
      if(fort&&sg<0)continue;                                                            // 要塞は正面に別の窓を付ける
      if(wide&&sg<0&&Math.abs(b)<Math.max(dw*.9,rr+.3))continue;                         // 横長は正面の扉・丸窓と重なる窓を省く
      if(bays.some(y=>y.k==='a'&&y.sg===sg&&Math.abs(b-y.u)<y.wb/2+.6))continue;          // 出窓で隠れる窓は省く
      if(!wide&&ann.some(an=>an.sg===sg&&Math.abs(b-an.bc)<an.wA/2+.5))continue;         // サイドの建物で隠れる窓は省く
      {const wy0=H*.34,fe=.13,a0=sg*(hw+.012),a1=sg*(hw+.045);
      Q(W(a0,wy0-fe,b-.35-fe),W(a0,wy0-fe,b+.35+fe),W(a0,wy0+1.1+fe,b+.35+fe),W(a0,wy0+1.1+fe,b-.35-fe),ctr,TRIM);                 // 窓枠
      Q(W(a,wy0,b-.35),W(a,wy0,b+.35),W(a,wy0+1.1,b+.35),W(a,wy0+1.1,b-.35),ctr,DARK);
      Q(W(a1,wy0+.52,b-.35),W(a1,wy0+.52,b+.35),W(a1,wy0+.58,b+.35),W(a1,wy0+.58,b-.35),ctr,TRIM);                                // 横桟
      Q(W(a1,wy0,b-.03),W(a1,wy0,b+.03),W(a1,wy0+1.1,b+.03),W(a1,wy0+1.1,b-.03),ctr,TRIM);                                        // 縦桟
      const sp=W(sg*(hw+.12),wy0-fe-.06,b);box(sp[0],sp[1],sp[2],fx,fz,1.2,.12,.3,TRIM);                                          // 窓台
      const hd=W(sg*(hw+.09),wy0+1.1+fe+.05,b);box(hd[0],hd[1],hd[2],fx,fz,1.1,.1,.22,TRIM)}}                                     // 窓の上の庇石
    // 屋根の出っ張り（ドーマー）: 両側の屋根に 1〜3 個ずつ、大きさもランダム
    const roofY=a=>H+RH*(1-Math.abs(a)/hw)+.12;let nd=0;
    for(const sg of fort?[]:[-1,1]){
      const n=Math.min(1+Math.floor(rnd()*3),Math.max(1,Math.floor(L/2.6))),sp=L/n,af=hw*.66,ab=af-hw*.28;
      for(let k=0;k<n;k++){
        const dwid=Math.min(sp*.62,(.9+rnd()*1.1)*Math.min(1.3,Math.max(.8,w/7))),bk=-hl+sp*(k+.5)+(rnd()-.5)*Math.max(0,sp-dwid-.9)*.6,hd=.5+rnd()*.5;
        const y1=roofY(af)-.35,y2=roofY(ab)+hd,ac=sg*(af+ab)/2,dc=W(ac,(y1+y2)/2,bk);
        box(dc[0],dc[1],dc[2],fx,fz,dwid,y2-y1,af-ab,WALL);
        const wb=roofY(af)+.2,wt=Math.max(wb+.3,y2-.25),a=sg*(af+.03);
        {const a1=sg*(af+.012),e=.12;Q(W(a1,wb-e,bk-dwid*.3-e),W(a1,wb-e,bk+dwid*.3+e),W(a1,wt+e,bk+dwid*.3+e),W(a1,wt+e,bk-dwid*.3-e),ctr,TRIM)}   // ドーマーの窓枠
        Q(W(a,wb,bk-dwid*.3),W(a,wb,bk+dwid*.3),W(a,wt,bk+dwid*.3),W(a,wt,bk-dwid*.3),ctr,DARK);
        const ph=dwid*.5+.1,hb=dwid/2+.15,ao=sg*(af+.22),ai=sg*ab,rc=W((ao+ai)/2,y2+ph/3,bk);
        const o1=W(ao,y2,bk-hb),o2=W(ao,y2,bk+hb),o3=W(ao,y2+ph,bk),i1=W(ai,y2,bk-hb),i2=W(ai,y2,bk+hb),i3=W(ai,y2+ph,bk);
        triOut(o1,o2,o3,rc,WALL);triOut(i1,i2,i3,rc,WALL);Q(o1,o3,i3,i1,rc,ROOFD);Q(o2,o3,i3,i2,rc,ROOFD);nd++;
      }
    }
    return{cx:bx,cz:bz,front:[f0x,f0z],w,L,h:fort?Hf:H+RH,dormers:nd,wide,fort,annex:ann.length,bays:bays.length};
  })();
  return{pos,col,circs:CIRC};
}
// ---------- 'land' タイプの城（castle_land.html の生成を、村・港町の城の場所に合わせたもの）----------
// 一番下の段は地形の最高点より段差ぶん高く、低い側は土台が地面の下まで届く。階段は道のほう（局所+z）へ向け、足もとの高さに合わせる。
// 階段・城壁・塔・館は村の他の建物と同じメッシュに入る（登れない障害物。当たり判定は一番下の城壁と階段のまわり）。
function drawCastleLand(k,tri3,H){
  const c=Math.cos(k.ry),s=Math.sin(k.ry),R=k.R;
  let mx=-1e9,mn=1e9;
  for(let a=-1;a<=1.001;a+=.25)for(let b=-1;b<=1.001;b+=.25){if(a*a+b*b>1.04)continue;const hh=H(k.x+a*R*c+b*R*s,k.z-a*R*s+b*R*c);mx=Math.max(mx,hh);mn=Math.min(mn,hh)}
  let gc=null;try{gc=colorFor(mx,0,k.x,k.z)}catch(e){}
  if(!gc||!(gc.length>=3)||gc.some(v=>!isFinite(v)))gc=[.42,.62,.25];
  const o=castleLandBuild({seed:k.seed,x:k.x,z:k.z,c,s,G:mx,ymin:mn-1.2,sj:k.sj,sl:k.sl,gc},H);
  const M=(gx,gy,gz)=>[k.x+gx*c+gz*s,gy,k.z-gx*s+gz*c],P=o.pos,C=o.col;
  for(let i=0;i+8<P.length;i+=9)tri3(M(P[i],P[i+1],P[i+2]),M(P[i+3],P[i+4],P[i+5]),M(P[i+6],P[i+7],P[i+8]),[C[i],C[i+1],C[i+2]]);
  return o.circs.map(q=>{const w=M(q[0],0,q[1]);return[w[0],w[2],q[2]]});
}
function drawVillageCastle(k,quad,H){                              // 大きな正方形の城。k={x,z,ry,w,d}。戻り値は当たり判定の円
  const c=Math.cos(k.ry),s=Math.sin(k.ry),w=k.w,d=k.d,hw=w/2,hd=d/2;
  let mx=-1e9,mn=1e9;for(let a=-1.3;a<=1.301;a+=.1)for(let b=-1.3;b<=1.301;b+=.1){const lx=a*hw,lz=b*hd,hh=H(k.x+lx*c+lz*s,k.z-lx*s+lz*c);if(Math.abs(a)<=1.1&&Math.abs(b)<=1.1)mx=Math.max(mx,hh);mn=Math.min(mn,hh)}   // 土台の外側まで約2m刻みで調べ、一番低い地面を見つける
  const gH=H(k.x+(hd+3)*s,k.z+(hd+3)*c),y0=Math.max(gH,mx-5)+.25,T=(lx,ly,lz)=>[k.x+lx*c+lz*s,y0+ly,k.z-lx*s+lz*c];   // 床の高さは門（道）側に合わせる。高い側の地面は最大5mまで城壁に埋まる
  const STONE=0x9a968c,DARK2=0x8a867c,LIGHT=0xc8c0ae,SLATE=0x3e4553,DK=0x1d1a18,GL=0x2a3544;
  const box=(cx,cy,cz,sx,sy,sz,color)=>{const V=(i,j,l)=>T(cx+(i-.5)*sx,cy+(j-.5)*sy,cz+(l-.5)*sz),R=T(cx,cy,cz);
    quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),color,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),color,R);
    quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),color,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),color,R);
    quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),color,R);quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),color,R)};
  const pyr=(cx,cz,half,y,rise,color)=>{const A=T(cx,y+rise,cz),R=T(cx,y+rise/2,cz);for(const[a,b]of[[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]])quad(T(cx+a[0]*half,y,cz+a[1]*half),T(cx+b[0]*half,y,cz+b[1]*half),A,A,color,R)};
  const PT=(f,u,y,p)=>f===0?T(u,y,p):f===1?T(u,y,-p):f===2?T(p,y,u):T(-p,y,u);
  const rect=(f,u,y,ww,hh,p,color)=>quad(PT(f,u-ww/2,y-hh/2,p),PT(f,u+ww/2,y-hh/2,p),PT(f,u+ww/2,y+hh/2,p),PT(f,u-ww/2,y+hh/2,p),color,T(0,y,0));
  const arch=(f,u,y,ww,hh,p,color)=>{const r0=ww/2,yc=y+hh-r0;rect(f,u,(y+yc)/2,ww,yc-y,p,color);for(let i=0;i<7;i++){const a0=Math.PI*i/7,a1=Math.PI*(i+1)/7;quad(PT(f,u,yc,p),PT(f,u+r0*Math.cos(a0),yc+r0*Math.sin(a0),p),PT(f,u+r0*Math.cos(a1),yc+r0*Math.sin(a1),p),PT(f,u+r0*Math.cos(a1),yc+r0*Math.sin(a1),p),color,T(0,yc,0))}};
  const BH=16,TH=27,KH=31;                                      // 城壁の高さ・四隅の塔の高さ・主塔の高さ
  const fy=Math.min(mn-y0-7,-10);   // 城壁・塔そのものを地面の下まで伸ばす（斜面でも浮かない）   // 石の基礎（斜面では一番低い地面の2m下まで伸ばして浮かさない）
  box(0,(fy+BH)/2,0,w,BH-fy,d,STONE);                          // 城壁（大きな正方形）
  box(0,BH,0,w+.8,.5,d+.8,LIGHT);                                 // 張り出した胸壁の帯
  for(let u=-hw+6;u<=hw-5;u+=3.6){for(const sz of[-1,1])box(u,BH+1.35,sz*(hd+.1),2,1.8,1.1,DARK2);for(const sx of[-1,1])box(sx*(hw+.1),BH+1.35,u,1.1,1.8,2,DARK2)}   // 狭間（ぎざぎざ）
  for(const sx of[-1,1])for(const sz of[-1,1]){box(sx*hw,(fy+TH)/2,sz*hd,10,TH-fy,10,STONE);box(sx*hw,TH+.3,sz*hd,11,.6,11,LIGHT);pyr(sx*hw,sz*hd,5.8,TH+.6,10,SLATE)}   // 四隅の塔
  box(0,BH+(KH-BH)/2,0,18,KH-BH,18,STONE);box(0,KH+.3,0,19,.6,19,LIGHT);pyr(0,0,10,KH+.6,12,SLATE);   // 中央の主塔
  arch(0,0,.3,8.6,10.6,hd+.05,LIGHT);arch(0,0,.3,6.8,9.8,hd+.09,DK);    // 正面の門
  for(const f of[0,1,2,3]){const len=f<2?w:d,p=f<2?hd:hw;for(const y of[7.5,12]){for(let u=-len/2+11;u<=len/2-10;u+=5.5){if(f===0&&Math.abs(u)<7&&y<11)continue;rect(f,u,y,.9,2.4,p+.05,LIGHT);rect(f,u,y,.6,2.1,p+.08,GL)}}}   // 窓（細長い）
  const circs=[];for(let t=-hw+1;t<=hw-1;t+=3.4){for(const sz of[-1,1])circs.push([k.x+t*c+sz*(hd-1.2)*s,k.z-t*s+sz*(hd-1.2)*c,2.4]);for(const sx of[-1,1])circs.push([k.x+sx*(hw-1.2)*c+t*s,k.z-sx*(hw-1.2)*s+t*c,2.4])}
  for(const sx of[-1,1])for(const sz of[-1,1])circs.push([k.x+sx*hw*c+sz*hd*s,k.z-sx*hw*s+sz*hd*c,6.5]);   // 四隅の塔
  return circs;
}
function vFields(P,trunks,branches,net,starts,C,fr){                  // 畑は道を引いたあとに置く。土の小道は ①枝道の先の延長 ②主道の外側の空き（枝道の根元から30m以上）から引き、その両脇に畑を並べる。畑は ゆるい斜面(高低差5m未満)・居住可能地・他の道から10m以上・川から14m以上
  const fields=[],lanes=[];
  const okf=f=>{
    if(Math.hypot(f.cx-C[0],f.cz-C[1])>VRMAX*VX+35)return false;
    if(!habRaw(f.cx,f.cz))return false;
    for(const[x,z]of[[f.cx,f.cz],...fieldCorners(f)])if(netDist(net,x,z)<10)return false;
    if(villageDist(f.cx,f.cz)<12)return false;
    return fieldOk(f,5);
  };
  const lane=(ox,oz,nx,nz,Wd)=>{
    const n0=fields.length,reach=farmLane(ox,oz,nx,nz,16,92,Wd,fr,okf,fields);
    if(reach<=0)return;
    let maxT=reach,h=vhRoad(ox,oz);                                                      // 小道が段差を通らない所までで打ち切る
    for(let u=VST;u<=reach;u+=VST){const hh=vhRoad(ox+nx*u,oz+nz*u);if(Math.abs(hh-h)>VDH){maxT=u-VST;break}h=hh}
    for(const f of fields.slice(n0))if((f.cx-ox)*nx+(f.cz-oz)*nz+f.hu>maxT+.01)fields.splice(fields.indexOf(f),1);
    const keep=fields.slice(n0);
    if(keep.length){let r2=0;for(const f of keep)r2=Math.max(r2,(f.cx-ox)*nx+(f.cz-oz)*nz+f.hu);lanes.push({seg:[ox,oz,ox+nx*r2,oz+nz*r2],fs:keep})}
  };
  for(const pl of branches){                                                              // ① 枝道の先の延長
    const e=pl[pl.length-1],q=pl[pl.length-2],dx=e[0]-q[0],dz=e[1]-q[1],l=Math.hypot(dx,dz)||1;
    lane(e[0],e[1],dx/l,dz/l,20+fr()*8);
  }
  for(const trunk of trunks){                                                             // ② 主道の外側の空き
    const Wd=20+fr()*8,PIT=2*Wd+9;let acc=0,nxt=10+fr()*PIT*.5;
    for(let j=0;j+1<trunk.length;j++){
      const a=trunk[j],b=trunk[j+1],sl=Math.hypot(b[0]-a[0],b[1]-a[1]);if(sl<1e-3)continue;
      while(nxt<=acc+sl){
        const t=(nxt-acc)/sl,ox=a[0]+(b[0]-a[0])*t,oz=a[1]+(b[1]-a[1])*t;
        if(starts.some(s=>Math.hypot(s[0]-ox,s[1]-oz)<30)){nxt+=8;continue}                 // 枝道の根元の近くは避ける
        const ang=vOutward(P,ox,oz);lane(ox,oz,Math.cos(ang),Math.sin(ang),Wd);
        nxt+=PIT;
      }
      acc+=sl;
    }
  }
  return{fields,lanes};
}
function vLines(P,pl,isMain,out){                                     // 点列を約18mの直線の小片に区切る（家を並べる単位）。主道は川と反対側(外側)の向きsdを持つ
  let a=0;
  while(a<pl.length-1){
    let b=Math.min(a+3,pl.length-1);if(pl.length-1-b<2)b=pl.length-1;
    const A=pl[a],B=pl[b],L={a:A,b:B};
    if(isMain){const dx=B[0]-A[0],dz=B[1]-A[1],l=Math.hypot(dx,dz)||1,ux=dx/l,uz=dz/l,o=vOutward(P,(A[0]+B[0])/2,(A[1]+B[1])/2);L.main=(-uz*Math.cos(o)+ux*Math.sin(o))>=0?1:-1}
    out.push(L);a=b;
  }
}
function hitField(cn,fields){                                      // 家の4隅が畑（1.5m外側まで）に入るか
  for(const f of fields)for(const p of cn){const dx=p[0]-f.cx,dz=p[1]-f.cz;if(Math.abs(dx*f.ux+dz*f.uz)<f.hu+1.5&&Math.abs(-dx*f.uz+dz*f.ux)<f.hv+1.5)return true}
  return false;
}
const VMINH=20;   // 家（教会と畑を除く）がこれ以下の村は破棄する
// 村を登録する前に家の数を数える。生成済みの地形(heightAt)は使えないので、川の溝を含む地形 vhRoad で代用する（教会の場所も同じ方法で見積もる）
function churchSiteCalc(v,heightAt){                                   // 村の教会の場所（村ごとに1回だけ決めて覚える。木を生やさない範囲にも使う）
  const rd=(px,pz)=>{let d=1e9;for(const s of v.roads){const e=segD(px,pz,s);if(e<d)d=e}return d};
  const lines=v.lines?v.lines.filter(L=>L.main):[];for(const[MM,sg]of v.lines?[]:v.twin?[[v.M,v.s],[v.M2,-v.s]]:[[v.M,v.s]])for(let j=0;j<MM.length-1;j+=2)lines.push({a:MM[j],b:MM[Math.min(j+2,MM.length-1)],main:sg});
  let chu=null;                                                       // 教会: 村の中心に近い主道ぞいに、正面を道へ向けて置く（道・川・急な斜面を避ける）。墓地は教会の横
  {const mid=L=>Math.hypot((L.a[0]+L.b[0])/2-v.cx,(L.a[1]+L.b[1])/2-v.cz),cands=lines.filter(L=>L.main&&Math.hypot(L.b[0]-L.a[0],L.b[1]-L.a[1])>=(v.lines?16:24)).sort((p,q)=>mid(p)-mid(q));
    for(const L of cands.slice(0,6)){
      const dx=L.b[0]-L.a[0],dz=L.b[1]-L.a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len,nx=-uz*L.main,nz=ux*L.main,ry=Math.atan2(-nx,-nz),c=Math.cos(ry),s=Math.sin(ry);
      const ox=L.a[0]+ux*len/2+nx*17.1,oz=L.a[1]+uz*len/2+nz*17.1,Wd=(lx,lz)=>[ox+lx*c+lz*s,oz-lx*s+lz*c];
      let ok=true;
      for(let lx=-9;lx<=14&&ok;lx+=3)for(let lz=-12;lz<=14;lz+=3){const q=Wd(lx,lz);if(rd(q[0],q[1])<2.6||riverEff(q[0],q[1])<3||heightAt(q[0],q[1])<WATER+1.5){ok=false;break}}
      if(!ok)continue;
      if(v.lines){const fp=[];for(let lx=-12;lx<=17;lx+=6)for(let lz=-15;lz<=16.5;lz+=6)fp.push(Wd(lx,lz));if(hitField(fp,v.fields))continue}   // 畑にはかけない
      const hs=[];for(const lx of[-4,0,4])for(const lz of[-8,0,11]){const q=Wd(lx,lz);hs.push(heightAt(q[0],q[1]))}
      const mx=Math.max(...hs),mn=Math.min(...hs);if(mx-mn>4.5)continue;
      chu={ox,oz,ry,c,s,y0:mx+.25,ymin:mn,W:Wd};break;
    }}
  return chu;
}
function villageHouseCount(v,heightAt){
  const r=mulberry(hash(Math.round(v.cx),Math.round(v.cz),SEED+6161)*1e9|0),roads=v.roads,houses=[];
  const rd=(px,pz)=>{let d=1e9;for(const s of roads){const e=segD(px,pz,s);if(e<d)d=e}return d};
  const WALL=[0xe8dcc0,0xf0e6d0,0xd9c49a,0xe0cfae,0xcdb98f,0xf2efe6],ROOF=[0x8a3f2d,0x6b4a30,0x555a62,0x7a5a35,0x9a4a38];
  const lines=v.lines?v.lines.slice():[];
  for(const[MM,BB,sg]of v.lines?[]:v.twin?[[v.M,v.B,v.s],[v.M2,v.B2,-v.s]]:[[v.M,v.B,v.s]]){
    for(let j=0;j<MM.length-1;j+=2)lines.push({a:MM[j],b:MM[Math.min(j+2,MM.length-1)],main:sg});
    if(BB){for(let j=0;j<BB.length-1;j+=2)lines.push({a:BB[j],b:BB[Math.min(j+2,BB.length-1)]});
    for(const k of v.ck)lines.push({a:MM[k],b:BB[k],cross:true})}
  }
  if(v.extra)for(const L of v.extra)lines.push(L);                  // 港町: 追加の通り（奥の通り・横道）
  const cornersOf=h=>{const c=Math.cos(h.ry),s=Math.sin(h.ry),o=[];for(const[lx,lz]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const x=lx*h.w/2,z=lz*h.d/2;o.push([h.x+x*c+z*s,h.z-x*s+z*c])}return o};
  const overlap=(A,B)=>{
    if(Math.hypot(A.x-B.x,A.z-B.z)>20)return false;
    for(const bd of[A,B])for(const ax of[[Math.cos(bd.ry),-Math.sin(bd.ry)],[Math.sin(bd.ry),Math.cos(bd.ry)]]){
      let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
      for(const p of A.cn){const t=p[0]*ax[0]+p[1]*ax[1];a0=Math.min(a0,t);a1=Math.max(a1,t)}
      for(const p of B.cn){const t=p[0]*ax[0]+p[1]*ax[1];b0=Math.min(b0,t);b1=Math.max(b1,t)}
      if(a1<b0-.8||b1<a0-.8)return false;
    }
    return true;
  };
  const chu=churchSiteCalc(v,heightAt);
  for(const L of lines){
    const dx=L.b[0]-L.a[0],dz=L.b[1]-L.a[1],len=Math.hypot(dx,dz);if(len<8)continue;
    const ux=dx/len,uz=dz/len;
    for(const sd of(L.main?[L.main]:[-1,1])){                       // 主道は川と反対側(外側)だけに家を建てる
      const nx=-uz*sd,nz=ux*sd;
      for(let p=L.cross?7:2.5;;){
        const wh=v.port&&L.main?r()<.4:false,hl=!wh&&r()<.12,tn=!wh&&!hl&&r()<.35,w=wh?10+r()*5:hl?11+r()*3:6+r()*2.6,d=wh?8+r()*2:hl?8+r()*1.5:7+r()*2.2,gap=.8+r()*2.2,wc=wh?0x8b6b4a:WALL[Math.floor(r()*WALL.length)],rc=wh?0x4a4a52:ROOF[Math.floor(r()*ROOF.length)],ch=r()<.5?-1:1,dr=r()<.5?-1:1;
        if(p+w>len-(L.cross?7:1.5))break;
        const off=3.1+d/2,h={x:L.a[0]+ux*(p+w/2)+nx*off,z:L.a[1]+uz*(p+w/2)+nz*off,ry:Math.atan2(-nx,-nz),w,d,wc,rc,ch,dr,hall:hl,town:tn};   // 玄関は道の側を向く
        p+=w+gap;
        h.cn=cornersOf(h);
        let ok=true;
        for(const q of h.cn)if(rd(q[0],q[1])<2.5||riverEff(q[0],q[1])<3){ok=false;break}
        if(!ok)continue;
        if(chu&&polyHit(h.cn,rectPoly(chu.ox,chu.oz,chu.c,chu.s,-12,17,-15,16.5)))continue
        if(v.manor&&polyHit(h.cn,rectPoly(v.manor.ox,v.manor.oz,v.manor.c,v.manor.s,-30*MS,30*MS,-34*MS,38*MS)))continue
        if(v.castle&&polyHit(h.cn,rectPoly(v.castle.x,v.castle.z,Math.cos(v.castle.ry),Math.sin(v.castle.ry),-v.castle.w/2-4,v.castle.w/2+4,-v.castle.d/2-4,v.castle.d/2+4)))continue
        if(v.wall&&pwallHit(v.wall,h.cn))continue
        const hs=[heightAt(h.x,h.z)];for(const q of h.cn)hs.push(heightAt(q[0],q[1]));
        const mx=Math.max(...hs),mn=Math.min(...hs);
        if(mx-mn>(v.lines||L.inl?3.5:4.5)||mn<WATER+1.5)continue;
        if((v.lines||L.inl)&&(!habK(h.x,h.z,v.k)||hitField(h.cn,v.fields||[])))continue;   // 川沿いの村: 居住可能地の中で、畑には建てない（地形は平らにしないので、段差の小さい所だけ）
        for(const o of houses)if(overlap(h,o)){ok=false;break}
        if(!ok)continue;
        h.y0=mx+.25;h.ymin=mn;houses.push(h);
      }
    }
  }
  return houses.length;
}
function findSites(RV,m){
  const P=RV.P,N=P.length,LEN=12;let last=-99,cnt=0;
  const nrm=i=>{const a=P[Math.max(0,i-1)],b=P[Math.min(N-1,i+1)];let tx=b.x-a.x,tz=b.z-a.z;const l=Math.hypot(tx,tz)||1;return[-tz/l,tx/l]};
  for(let i0=6;i0+LEN<N-8&&cnt<5;i0+=2){
    if(i0<last+LEN+4)continue;
    VK=1.15+.5*mulberry(hash(Math.round(P[i0+6].x),Math.round(P[i0+6].z),SEED+7171)*1e9|0)();   // 村ごとに条件の緩さを変える（1.15〜1.65）
    VX=mulberry(hash(Math.round(P[i0+6].x),Math.round(P[i0+6].z),SEED+8181)*1e9|0)()<.3?1.7:1;if(VX>1)VK*=1.25;   // 30%: 内陸にも広がる村（範囲を広げ、条件をゆるめる）
    if(P[i0].b-P[i0+LEN].b>28||P[i0+LEN].b<WATER+2)continue;    // 急流・河口は避ける
    const mid=P[i0+6],c=climateAt(mid.x,mid.z);if(c.de>=.5||c.gr+c.bf+c.ta+c.tf+c.cg<.4)continue;   // 砂漠を除外し、草原か森にだけ村を作る（CVはすぐ読む）
    const dv={};
    for(const s of[1,-1]){                                      // 川の両岸がそれぞれ「居住可能エリア」か（主道・奥の道の幅 10〜56m を調べる）。dv=居住不可の割合（0=全部可）。川面から12m以上高い所は崖なので不可
      let miss=0,tot=0,dev=0;
      for(let i=i0;i<=i0+LEN&&miss<=5;i+=3){const n=nrm(i),p=P[i];for(const o of[10,32,56]){const oo=p.hw+o,x=p.x+s*n[0]*oo,z=p.z+s*n[1]*oo;tot++;if(habRaw(x,z))dev=Math.max(dev,Math.abs(rawH(x,z)-p.h));else miss++}}
      dv[s]=dev>24*VK/1.45?9:miss/tot;
    }
    const bs=dv[1]<=dv[-1]?1:-1;
    if(dv[bs]>.55*VK/1.45)continue;
    let twin=dv[-bs]<=.55*VK/1.45;                                      // 対岸も平らなら、橋をかけて対岸にも村を広げる
    const fr=mulberry(hash(Math.round(P[i0+6].x),Math.round(P[i0+6].z),SEED+6262)*1e9|0);
    const net=[],br=[],trunks=[];                                // ① 道を先に引く（地形は平らにならさない）: 主道（川に沿う）→ 枝道（川から離れる向き）
    const T1=vTrunk(P,i0+6,bs,nrm,net,null,fr);
    if(!T1||(T1.pl.length-1)*VST<30)continue;                    // 道が短すぎる所には村を作らない
    const C=T1.S;net.push(T1.pl);trunks.push(T1.pl);vBranches(P,T1.pl,net,C,fr,br);
    let bridges=[];
    if(twin){                                                    // 対岸も居住可能なら、対岸にも主道と枝道を引いて橋でつなぐ（つなげなければ片岸だけ）
      const T2=vTrunk(P,i0+6,-bs,nrm,net,C,fr);
      if(T2&&(T2.pl.length-1)*VST>=30){const bg=vBridges(P,T1.pl,T2.pl);if(bg.length){bridges=bg;net.push(T2.pl);trunks.push(T2.pl);vBranches(P,T2.pl,net,C,fr,br)}}
    }
    const FL=vFields(P,trunks,br,net,br.map(q=>q[0]),C,fr);      // ② 畑（小道つき）を道のあとに置く。畑のための平坦化はしない
    const fields=FL.fields,roads=[],lines=[];
    for(const pl of net)for(let k=0;k+1<pl.length;k++)roads.push([pl[k][0],pl[k][1],pl[k+1][0],pl[k+1][1]]);
    for(const q of FL.lanes)roads.push(q.seg);                   // 畑が残った小道だけ道にする
    for(const[A,B]of bridges)roads.push([A[0],A[1],B[0],B[1]]);
    for(const pl of trunks)vLines(P,pl,true,lines);for(const pl of br)vLines(P,pl,false,lines);   // ③ 家は buildVillage が、この小片（lines）に沿って置く
    const v={k:VK,vx:VX,cx:C[0],cz:C[1],s:bs,lines,bridges,roads,P,i0,houses:null,deck:null,fields,fcircs:null,manor:null};
    v.settlementType='village';v.label=settlementLabel(v,'village');
    if(villageHouseCount(v,vhRoad)<=VMINH){last=i0;continue}     // 家が少なすぎる村は破棄（この区間は飛ばして次へ）
    for(const f of fields)fieldRegister(f);
    const nr0=roads.length;
    {const ends=[];for(const pl of br)if(pl.length>=2){const a=pl[pl.length-1],b=pl[pl.length-2];ends.push({p:a,th:Math.atan2(a[1]-b[1],a[0]-b[0])})}
      for(const pl of trunks)if(pl.length>=2){const a=pl[pl.length-1],b=pl[pl.length-2],c2=pl[0],d2=pl[1];ends.push({p:a,th:Math.atan2(a[1]-b[1],a[0]-b[0])},{p:c2,th:Math.atan2(c2[1]-d2[1],c2[0]-d2[0])})}
      try{villageCastle(v,ends,vhRoad)}catch(err){console.error(err)}}     // 確率で、道を少し伸ばした先に城を置く
    try{                                                                // 道・畑・城をぐるっと囲む壁。段差があれば高い所に寄せる（川は無視）。城へ向かう道の先は城の中なので門は作らない
      const cs=roads.length>nr0?[roads[nr0][0],roads[nr0][1]]:null,ge=[];
      for(const pl of br)ge.push(pl[pl.length-1]);for(const pl of trunks){ge.push(pl[pl.length-1]);ge.push(pl[0])}
      const wl=villageWallPath(v,vhRoad,ge.filter(e=>!(cs&&Math.hypot(e[0]-cs[0],e[1]-cs[1])<3)));
      if(wl){v.wall={pts:wl.pts,gates:wl.gates,closed:true,c:wl.c};for(const g of wl.roads)roads.push(g)}
    }catch(err){console.error(err)}
    VLIST.push(v);vRegister(v);last=i0;cnt++;
  }
  VK=1.45;VX=1;
}
function villageChurchSite(v){                                   // 村の教会の場所（村ごとに1回だけ決めて覚える。木を生やさない範囲にも使う）
  if(v.chs!==undefined)return v.chs;
  v.chs=null;
  const rd=(px,pz)=>{let d=1e9;for(const s of v.roads){const e=segD(px,pz,s);if(e<d)d=e}return d};
  const lines=v.lines?v.lines.filter(L=>L.main):[];for(const[MM,sg]of v.lines?[]:v.twin?[[v.M,v.s],[v.M2,-v.s]]:[[v.M,v.s]])for(let j=0;j<MM.length-1;j+=2)lines.push({a:MM[j],b:MM[Math.min(j+2,MM.length-1)],main:sg});
  let chu=null;                                                       // 教会: 村の中心に近い主道ぞいに、正面を道へ向けて置く（道・川・急な斜面を避ける）。墓地は教会の横
  {const mid=L=>Math.hypot((L.a[0]+L.b[0])/2-v.cx,(L.a[1]+L.b[1])/2-v.cz),cands=lines.filter(L=>L.main&&Math.hypot(L.b[0]-L.a[0],L.b[1]-L.a[1])>=(v.lines?16:24)).sort((p,q)=>mid(p)-mid(q));
    for(const L of cands.slice(0,6)){
      const dx=L.b[0]-L.a[0],dz=L.b[1]-L.a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len,nx=-uz*L.main,nz=ux*L.main,ry=Math.atan2(-nx,-nz),c=Math.cos(ry),s=Math.sin(ry);
      const ox=L.a[0]+ux*len/2+nx*17.1,oz=L.a[1]+uz*len/2+nz*17.1,Wd=(lx,lz)=>[ox+lx*c+lz*s,oz-lx*s+lz*c];
      let ok=true;
      for(let lx=-9;lx<=14&&ok;lx+=3)for(let lz=-12;lz<=14;lz+=3){const q=Wd(lx,lz);if(rd(q[0],q[1])<2.6||riverEff(q[0],q[1])<3||heightAt(q[0],q[1])<WATER+1.5){ok=false;break}}
      if(!ok)continue;
      if(v.lines){const fp=[];for(let lx=-12;lx<=17;lx+=6)for(let lz=-15;lz<=16.5;lz+=6)fp.push(Wd(lx,lz));if(hitField(fp,v.fields))continue}   // 畑にはかけない
      const hs=[];for(const lx of[-4,0,4])for(const lz of[-8,0,11]){const q=Wd(lx,lz);hs.push(heightAt(q[0],q[1]))}
      const mx=Math.max(...hs),mn=Math.min(...hs);if(mx-mn>4.5)continue;
      chu={ox,oz,ry,c,s,y0:mx+.25,ymin:mn,W:Wd};break;
    }}
  return v.chs=chu;
}
function churchTreeBlock(x,z){                                   // 村の教会と墓地・屋敷の敷地の中か
  for(const v of VLIST){
    if(v.castle){const k=v.castle,dx=x-k.x,dz=z-k.z;if(Math.hypot(dx,dz)<k.w*.8+10){const c=Math.cos(k.ry),s=Math.sin(k.ry),lx=dx*c-dz*s,lz=dx*s+dz*c;if(Math.abs(lx)<k.w/2+6&&Math.abs(lz)<k.d/2+6)return true}}   // 城の敷地
    if(v.wall&&Math.hypot(v.cx-x,v.cz-z)<400&&pwallD(v.wall,x,z)<6)return true;   // 港町の壁
    if(v.manor&&Math.hypot(v.manor.ox-x,v.manor.oz-z)<90*MS&&inManor(v.manor,x,z,4))return true;
    if(Math.hypot(v.cx-x,v.cz-z)>90)continue;
    const c=villageChurchSite(v);if(!c)continue;
    const dx=x-c.ox,dz=z-c.oz,lx=dx*c.c-dz*c.s,lz=dx*c.s+dz*c.c;
    if(lx>-12&&lx<17&&lz>-15&&lz<16.5)return true;
  }
  return false;
}
function drawVillageHouse(h,quad){
  if(h.town){                                                       // 西洋の王都・公国の街と同じ家（石の1階＋木骨の上階・屋根窓・日よけ・鎧戸など）を村にも混ぜる（約35%）
    const c=Math.cos(h.ry),s=Math.sin(h.ry),T=(lx,ly,lz)=>[h.x+lx*c+lz*s,h.y0+ly,h.z-lx*s+lz*c],hw=h.w/2+.1,hd=h.d/2+.1,fh=Math.max(.3,h.y0-(h.ymin===undefined?h.y0:h.ymin)+.5),R=T(0,-fh/2,0),V=(i,j,k)=>T(i?hw:-hw,j?.1:-fh,k?hd:-hd);
    quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),0x8d8a82,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),0x8d8a82,R);quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),0x8d8a82,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),0x8d8a82,R);   // 斜面の下の石の基礎
    drawTownHouse(h,quad,mulberry(hash(Math.round(h.x*7),Math.round(h.z*7),SEED+5961)*1e9|0));return}
  if(h.hall){drawStoneBaseHall(h,quad,mulberry(hash(Math.round(h.x*7),Math.round(h.z*7),SEED+5960)*1e9|0));return}   // 村に混ぜる、石の台の横長の建物（約12%）
                                // 村の家1軒（二階建て・木骨・尖った切妻屋根・煙突）。h={x,z,ry,w,d,wc,rc,ch,dr,y0,ymin}。玄関は局所+z側
    const c=Math.cos(h.ry),s=Math.sin(h.ry),T=(lx,ly,lz)=>[h.x+lx*c+lz*s,h.y0+ly,h.z-lx*s+lz*c];
    const W=6.2,rh=Math.min(6,(h.d/2+.6)*1.15),ref=T(0,W/2,0);
    const box=(cx,cy,cz,sx,sy,sz,color)=>{
      const V=(i,j,k)=>T(cx+(i-.5)*sx,cy+(j-.5)*sy,cz+(k-.5)*sz),R=T(cx,cy,cz);
      quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),color,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),color,R);
      quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),color,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),color,R);
      quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),color,R);quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),color,R);
    };
    const hf=h.y0-h.ymin+.5;
    box(0,(.35-hf)/2,0,h.w+.3,hf+.35,h.d+.3,0x8d8a82);                 // 石の基礎（段差を埋める）
    box(0,W/2,0,h.w,W,h.d,h.wc);                                        // 二階建ての壁
    box(0,3.1,0,h.w+.14,.3,h.d+.14,0x5a3d26);box(0,W,0,h.w+.14,.25,h.d+.14,0x5a3d26);   // 木骨: 腰の梁・軒の梁
    for(const sx of[-1,1])for(const sz of[-1,1])box(sx*h.w/2,W/2,sz*h.d/2,.32,W,.32,0x5a3d26);   // 角の柱
    const fz=h.d/2,dx0=h.dr*h.w*.27;
    box(dx0,1.05,fz+.04,1.1,2.1,.1,0x4a2e1a);box(dx0,.08,fz+.5,1.5,.16,.8,0x8d8a82);               // 玄関と踏み段
    const win=(x,y,z,ax)=>{ax?(box(x,y,z,.08,1.5,1.2,0xf0ece0),box(x+Math.sign(x)*.03,y,z,.1,1.25,.95,0x2a3544)):(box(x,y,z,1.2,1.5,.08,0xf0ece0),box(x,y,z+Math.sign(z)*.03,.95,1.25,.1,0x2a3544))};
    if(h.w>9){const xs=[];for(let k=-3;k<=3;k++){const x=k*3.3;if(Math.abs(x)<h.w/2-1.2)xs.push(x)}                     // 幅の広い家: 窓を3.3mおきに並べる
      for(const x of xs){if(Math.abs(x-dx0)>1.6)win(x,1.8,fz+.04,false);win(x,4.6,fz+.04,false);for(const y of[1.8,4.6])win(x,y,-fz-.04,false)}
    }else{
    win(-dx0,1.8,fz+.04,false);win(-dx0,4.6,fz+.04,false);win(dx0,4.6,fz+.04,false);                // 前面（玄関の反対側に一階の窓）
    for(const y of[1.8,4.6])for(const x of[-h.w*.27,h.w*.27])win(x,y,-fz-.04,false);                // 背面
    }
    for(const y of[1.8,4.6])for(const sx of[-1,1])win(sx*(h.w/2+.04),y,0,true);                    // 側面
    const X=h.w/2+.45,Z=h.d/2+.6;                                       // 尖った切妻屋根
    quad(T(-X,W,Z),T(X,W,Z),T(X,W+rh,0),T(-X,W+rh,0),h.rc,ref);quad(T(-X,W,-Z),T(X,W,-Z),T(X,W+rh,0),T(-X,W+rh,0),h.rc,ref);
    for(const sx of[-1,1]){const a=T(sx*(h.w/2),W,-h.d/2),b=T(sx*(h.w/2),W,h.d/2),t=T(sx*(h.w/2),W+rh,0);quad(a,b,t,t,h.wc,ref)}   // 切妻の壁面（三角）
    box(h.ch*h.w*.3,W+(rh+1.3)/2,0,.9,rh+1.3,.9,0x9a4a38);box(h.ch*h.w*.3,W+rh+1.4,0,1.15,.2,1.15,0x55555a);   // 煙突
}
function churchYard(bx,gy,Wd,ox,oz){                             // 村の教会の墓地: 低い石垣（正面の中央に門）と墓石・十字架。bxで描き、当たり判定の円を返す
  const wc=[];
      const wall=(x0,z0,x1,z1,gap)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.ceil(L/2.4),al=z0===z1;     // 墓地の低い石垣（正面の中央に門の切れ目）
        for(let i=0;i<n;i++){const t=(i+.5)/n,lx=x0+(x1-x0)*t,lz=z0+(z1-z0)*t;if(gap&&Math.abs(lx)<gap)continue;bx(lx,gy(lx,lz)-.8,lz,al?L/n+.05:.6,1.8,al?.6:L/n+.05,0x9a968c);const q=Wd(lx,lz);wc.push([q[0],q[1],1])}};
      wall(-9,14,14,14,1.7);wall(-9,-12,14,-12);wall(-9,-12,-9,14);wall(14,-12,14,14);
      const gr=mulberry(hash(Math.round(ox),Math.round(oz),SEED+3131)*1e9|0);                    // 墓石と十字架
      for(let lx=6.5;lx<=12.5;lx+=2.2)for(let lz=-9;lz<=11;lz+=2.7){if(gr()<.25)continue;const x=lx+(gr()-.5)*.6,z=lz+(gr()-.5)*.6,h=gy(x,z);if(gr()<.3){bx(x,h-.2,z,.12,1.4,.12,0x8a8478);bx(x,h+.75,z,.7,.12,.12,0x8a8478)}else bx(x,h-.2,z,.65,1.1,.2,0xb9b6ad)}
  return wc;
}
function buildVillage(v){
  const r=mulberry(hash(Math.round(v.cx),Math.round(v.cz),SEED+6161)*1e9|0),roads=v.roads,houses=[];
  const rd=(px,pz)=>{let d=1e9;for(const s of roads){const e=segD(px,pz,s);if(e<d)d=e}return d};
  const WALL=[0xe8dcc0,0xf0e6d0,0xd9c49a,0xe0cfae,0xcdb98f,0xf2efe6],ROOF=[0x8a3f2d,0x6b4a30,0x555a62,0x7a5a35,0x9a4a38];
  const lines=v.lines?v.lines.slice():[];
  for(const[MM,BB,sg]of v.lines?[]:v.twin?[[v.M,v.B,v.s],[v.M2,v.B2,-v.s]]:[[v.M,v.B,v.s]]){
    for(let j=0;j<MM.length-1;j+=2)lines.push({a:MM[j],b:MM[Math.min(j+2,MM.length-1)],main:sg});
    if(BB){for(let j=0;j<BB.length-1;j+=2)lines.push({a:BB[j],b:BB[Math.min(j+2,BB.length-1)]});
    for(const k of v.ck)lines.push({a:MM[k],b:BB[k],cross:true})}
  }
  if(v.extra)for(const L of v.extra)lines.push(L);                  // 港町: 追加の通り（奥の通り・横道）
  const cornersOf=h=>{const c=Math.cos(h.ry),s=Math.sin(h.ry),o=[];for(const[lx,lz]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const x=lx*h.w/2,z=lz*h.d/2;o.push([h.x+x*c+z*s,h.z-x*s+z*c])}return o};
  const overlap=(A,B)=>{
    if(Math.hypot(A.x-B.x,A.z-B.z)>20)return false;
    for(const bd of[A,B])for(const ax of[[Math.cos(bd.ry),-Math.sin(bd.ry)],[Math.sin(bd.ry),Math.cos(bd.ry)]]){
      let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
      for(const p of A.cn){const t=p[0]*ax[0]+p[1]*ax[1];a0=Math.min(a0,t);a1=Math.max(a1,t)}
      for(const p of B.cn){const t=p[0]*ax[0]+p[1]*ax[1];b0=Math.min(b0,t);b1=Math.max(b1,t)}
      if(a1<b0-.8||b1<a0-.8)return false;
    }
    return true;
  };
  const chu=villageChurchSite(v);
  for(const L of lines){
    const dx=L.b[0]-L.a[0],dz=L.b[1]-L.a[1],len=Math.hypot(dx,dz);if(len<8)continue;
    const ux=dx/len,uz=dz/len;
    for(const sd of(L.main?[L.main]:[-1,1])){                       // 主道は川と反対側(外側)だけに家を建てる
      const nx=-uz*sd,nz=ux*sd;
      for(let p=L.cross?7:2.5;;){
        const wh=v.port&&L.main?r()<.4:false,hl=!wh&&r()<.12,tn=!wh&&!hl&&r()<.35,w=wh?10+r()*5:hl?11+r()*3:6+r()*2.6,d=wh?8+r()*2:hl?8+r()*1.5:7+r()*2.2,gap=.8+r()*2.2,wc=wh?0x8b6b4a:WALL[Math.floor(r()*WALL.length)],rc=wh?0x4a4a52:ROOF[Math.floor(r()*ROOF.length)],ch=r()<.5?-1:1,dr=r()<.5?-1:1;
        if(p+w>len-(L.cross?7:1.5))break;
        const off=3.1+d/2,h={x:L.a[0]+ux*(p+w/2)+nx*off,z:L.a[1]+uz*(p+w/2)+nz*off,ry:Math.atan2(-nx,-nz),w,d,wc,rc,ch,dr,hall:hl,town:tn};   // 玄関は道の側を向く
        p+=w+gap;
        h.cn=cornersOf(h);
        let ok=true;
        for(const q of h.cn)if(rd(q[0],q[1])<2.5||riverEff(q[0],q[1])<3){ok=false;break}
        if(!ok)continue;
        if(chu&&polyHit(h.cn,rectPoly(chu.ox,chu.oz,chu.c,chu.s,-12,17,-15,16.5)))continue
        if(v.manor&&polyHit(h.cn,rectPoly(v.manor.ox,v.manor.oz,v.manor.c,v.manor.s,-30*MS,30*MS,-34*MS,38*MS)))continue
        if(v.castle&&polyHit(h.cn,rectPoly(v.castle.x,v.castle.z,Math.cos(v.castle.ry),Math.sin(v.castle.ry),-v.castle.w/2-4,v.castle.w/2+4,-v.castle.d/2-4,v.castle.d/2+4)))continue
        if(v.wall&&pwallHit(v.wall,h.cn))continue
        const hs=[heightAt(h.x,h.z)];for(const q of h.cn)hs.push(heightAt(q[0],q[1]));
        const mx=Math.max(...hs),mn=Math.min(...hs);
        if(mx-mn>(v.lines||L.inl?3.5:4.5)||mn<WATER+1.5)continue;
        if((v.lines||L.inl)&&(!habK(h.x,h.z,v.k)||hitField(h.cn,v.fields||[])))continue;   // 川沿いの村: 居住可能地の中で、畑には建てない（地形は平らにしないので、段差の小さい所だけ）
        for(const o of houses)if(overlap(h,o)){ok=false;break}
        if(!ok)continue;
        h.y0=mx+.25;h.ymin=mn;houses.push(h);
      }
    }
  }
  const pos=[],nor=[],col=[],C=new THREE.Color();
  const quad=(A,B,Cc,D,color,ref)=>{
    let u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],w=[Cc[0]-A[0],Cc[1]-A[1],Cc[2]-A[2]];
    let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    const fc=[(A[0]+B[0]+Cc[0]+D[0])/4-ref[0],(A[1]+B[1]+Cc[1]+D[1])/4-ref[1],(A[2]+B[2]+Cc[2]+D[2])/4-ref[2]];
    let vs=[A,B,Cc,A,Cc,D];
    if(n[0]*fc[0]+n[1]*fc[1]+n[2]*fc[2]<0){vs=[A,Cc,B,A,D,Cc];n=[-n[0],-n[1],-n[2]]}
    const l=Math.hypot(n[0],n[1],n[2])||1;C.setHex(color);
    for(const q of vs){pos.push(q[0],q[1],q[2]);nor.push(n[0]/l,n[1]/l,n[2]/l);col.push(C.r,C.g,C.b)}
  };
  const tri3=(A,B,Cc,k)=>{                                                  // 三角形1枚（面の向きは頂点の並び順のまま。色は[r,g,b]）
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],wx=Cc[0]-A[0],wy=Cc[1]-A[1],wz=Cc[2]-A[2];
    const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx,l=Math.hypot(nx,ny,nz)||1;
    for(const q of[A,B,Cc]){pos.push(q[0],q[1],q[2]);nor.push(nx/l,ny/l,nz/l);col.push(k[0],k[1],k[2])}
  };
  for(const h of houses)drawVillageHouse(h,quad);
  v.deck=[];v.rails=[];
  let pcirc=[];
  if(v.port)try{pcirc=portBuild(v.port,quad,v.deck)}catch(err){console.error(err);EU_ERR='港: '+(err&&err.message)}
  if(v.castle)try{pcirc=pcirc.concat(v.castle.kind==='land'?drawCastleLand(v.castle,tri3,heightAt):drawVillageCastle(v.castle,quad,heightAt))}catch(err){console.error(err);EU_ERR='村の城: '+(err&&err.message)}
  if(v.wall)try{pcirc=pcirc.concat(drawPortWall(v,quad,heightAt))}catch(err){console.error(err);EU_ERR='港の城壁: '+(err&&err.message)}
  for(const[a,b]of(v.bridges||(v.twin?v.bk.map(k=>[v.M[k],v.M2[k]]):[]))){                                       // 橋: 両岸の主道の高さをなめらかにつなぐ木の床と欄干（歩ける）
    const g0=heightAt(a[0],a[1]),g1=heightAt(b[0],b[1]),len=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len,lx=-uz*1.7,lz=ux*1.7;   // 橋の半幅1.7m（幅3.4m。両岸の主道にはみ出さない）
    const EXT=2.5,AH=Math.min(2.4,Math.max(.9,len*.07));                                    // 端を地面にめり込ませる長さ / アーチの高さ
    const Y=t=>g0+(g1-g0)*(t/len)+AH*Math.sin(Math.PI*t/len)+.25;                           // ゆるいアーチ: 両岸の主道の高さ(+.25)から盛り上がり、両端のさきは地面の下へ沈む
    const NS=Math.max(2,Math.ceil((len+2*EXT)/2));
    for(let k=0;k<NS;k++){                                                                  // 2mごとの小片をつないで曲線にする
      const t0=-EXT+(len+2*EXT)*k/NS,t1=-EXT+(len+2*EXT)*(k+1)/NS,
            p0=[a[0]+ux*t0,Y(t0),a[1]+uz*t0],p1=[a[0]+ux*t1,Y(t1),a[1]+uz*t1],
            top=[[p0[0]-lx,p0[1],p0[2]-lz],[p0[0]+lx,p0[1],p0[2]+lz],[p1[0]+lx,p1[1],p1[2]+lz],[p1[0]-lx,p1[1],p1[2]-lz]],
            mid=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2,(p0[2]+p1[2])/2];
      quad(top[0],top[1],top[2],top[3],0x8a6a45,[mid[0],mid[1]-5,mid[2]]);
      const dn=q=>[q[0],q[1]-.45,q[2]],up=q=>[q[0],q[1]+.95,q[2]];
      quad(dn(top[0]),dn(top[1]),dn(top[2]),dn(top[3]),0x5e4630,[mid[0],mid[1]+5,mid[2]]);                       // 床の裏
      const rl=(t0+t1)/2>=3.5&&(t0+t1)/2<=len-3.5;   // 欄干は両岸の主道から3.5m以上離れた所だけ（岸の道をふさがない）
      if(rl){quad(dn(top[0]),dn(top[3]),up(top[3]),up(top[0]),0x6b4a30,mid);quad(dn(top[1]),dn(top[2]),up(top[2]),up(top[1]),0x6b4a30,mid)}   // 欄干（両側）
      if(rl)for(const sd of[-1,1])v.rails.push({x:mid[0]+(-uz)*1.7*sd,z:mid[2]+ux*1.7*sd,ux,uz,hl:(t1-t0)/2+.06,hw:.1,top:Math.max(p0[1],p1[1])+.95,bot:Math.min(p0[1],p1[1])-.45});   // 欄干の当たり判定（両側・小片ごとの細い箱。上は飛び越せる／下はくぐれる）
    }
    for(let t=-EXT;t<=len+EXT+1e-6;t+=1.5){for(const c of[-.8,.8])v.deck.push({x:a[0]+ux*t+(-uz)*c,z:a[1]+uz*t+ux*c,w:2.4,d:2.4,top:Y(t),m:.1,walk:true})}   // 歩ける床（アーチに沿った高さ。地面の下に沈んだ分は地面が優先される）
  }
  v.church=null;
  if(chu)try{
    const T=q=>[chu.ox+q[0]*chu.c+q[2]*chu.s,chu.y0+q[1],chu.oz-q[0]*chu.s+q[2]*chu.c],wc=[],gy=(lx,lz)=>{const q=chu.W(lx,lz);return heightAt(q[0],q[1])-chu.y0};
    churchBuild('v',(A,B,Cc,D,color,ref)=>quad(T(A),T(B),T(Cc),T(D),color,T(ref)),chu.y0-chu.ymin+.5,bx=>{for(const q of churchYard(bx,gy,chu.W,chu.ox,chu.oz))wc.push(q)
    });
    v.church={circs:churchCircs(CH_PARTS.v,chu.W).concat(wc)};
  }catch(err){console.error(err);EU_ERR='村の教会: '+(err&&err.message||err)}
  if(v.manor)try{
    const m=v.manor,Wd=(lx,lz)=>[m.ox+lx*m.c+lz*m.s,m.oz-lx*m.s+lz*m.c],[mx,mn]=manorSample(Wd,heightAt,m.kind),y0=mx+.25;
    const gy=(lx,lz)=>{const q=Wd(lx,lz);return heightAt(q[0],q[1])-y0},T=q=>[m.ox+q[0]*m.c+q[2]*m.s,y0+q[1],m.oz-q[0]*m.s+q[2]*m.c];
    const cs=manorBuild((A,B,Cc,D,color,ref)=>quad(T(A),T(B),T(Cc),T(D),color,T(ref)),gy,y0-mn+.5,m.kind).map(q=>{const p=Wd(q[0],q[1]);return[p[0],p[1],q[2]]});
    v.church={circs:(v.church?v.church.circs:[]).concat(cs)};
  }catch(err){console.error(err);EU_ERR='村の屋敷: '+(err&&err.message||err)}
  if(pcirc.length)v.church={circs:(v.church?v.church.circs:[]).concat(pcirc)};
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  if(!VMAT)VMAT=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(g,VMAT);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
  for(const h of houses){                                               // 当たり判定: 家の外周に円を並べる
    const c=Math.cos(h.ry),s=Math.sin(h.ry),hx=h.w/2-1.2,hz=h.d/2-1.2,pts=[];
    for(let x=-hx;x<=hx+.01;x+=Math.max(.5,2*hx/Math.ceil(2*hx/2.2||1)))for(const z of[-hz,hz])pts.push([x,z]);
    for(let z=-hz+2.2;z<hz-.1;z+=2.2)for(const x of[-hx,hx])pts.push([x,z]);
    h.circs=pts.map(([lx,lz])=>[h.x+lx*c+lz*s,h.z-lx*s+lz*c,1.6]);delete h.cn;
  }
  const fn=buildFences(v.fields,0,0,0);mesh.add(fn.mesh);v.fcircs=fn.circs;
  v.houses=houses;return mesh;
}
function updateVillages(){
  for(const v of VLIST){
    const d=Math.hypot(v.cx-player.x,v.cz-player.z);
    if(d<330&&!VG.has(v)){try{const m=buildVillage(v);scene.add(m);VG.set(v,m)}catch(err){console.error(err);EU_ERR='村: '+(err&&err.message);VG.set(v,null)}}
    else if(d>450&&VG.has(v)){const m=VG.get(v);if(m){scene.remove(m);m.geometry.dispose();m.children.forEach(c=>c.geometry.dispose())}VG.delete(v);v.houses=null;v.deck=null;v.rails=null;v.fcircs=null;v.church=null}
  }
}
function clearVillages(){FLDV.clear();for(const m of VG.values())if(m){scene.remove(m);m.geometry.dispose();m.children.forEach(c=>c.geometry.dispose())}VG.clear();VVH.clear();FLD.clear();VLIST.length=0;PRH.clear();PORTS.length=0;portCells.clear();empCache.forEach(E=>{if(E){E.portsDone=false;E.ports=null}})}
// ---------- 帝国の港町 ----------
// 帝国の領土の中で海に面した場所に、港を中心とした街を作る（川沿いの村の海岸版）。水の上は今までどおり歩ける。
// 局所座標 a=岸に沿う向き, b=陸側へ向かう距離（b=0が海岸線の目安）。場所は rawH と帝国の領土だけで決まる。
//  ・岸壁の帯(b=-4〜88)を平らにならす（heightAtのportFlat）。沖側は12mでなめらかに海底へ、他は30mで元の地形へ
//  ・3本の通り(b=6 岸壁通り / 36 / 66)と横道に家を並べる（家は村と同じ。岸壁通りには倉庫風の大きな家が混ざる）
//  ・桟橋3本・防波堤と灯台・船・積み荷・岸壁の縁石を、近づいた時に村の家と同じメッシュへ描く
function portRegister(p){
  const cx=p.ox+p.nx*51,cz=p.oz+p.nz*51,R=180;
  for(let X=Math.floor((cx-R)/PRC);X<=Math.floor((cx+R)/PRC);X++)for(let Z=Math.floor((cz-R)/PRC);Z<=Math.floor((cz+R)/PRC);Z++){const k=X+','+Z;let L=PRH.get(k);if(!L){L=[];PRH.set(k,L)}L.push(p)}
}
function portFlat(x,z){                                          // 岸壁の帯を平らにする重みと目標の高さ（なければnull）
  const L=PRH.get(Math.floor(x/PRC)+','+Math.floor(z/PRC));if(!L)return null;
  let bw=0,bh=0;
  for(const p of L){
    const dx=x-p.ox,dz=z-p.oz,a=dx*p.tx+dz*p.tz,b=dx*p.nx+dz*p.nz;
    const q=Math.hypot(Math.max(0,Math.abs(a)-130)/30,b<PB0?(PB0-b)/12:b>PB1?(b-PB1)/30:0);
    if(q>=1)continue;let w=1-q;w=w*w*(3-2*w);
    if(w>bw){bw=w;bh=p.Hq}
  }
  return bw>0?[bw,bh]:null;
}
function portQuay(x,z){                                          // 岸壁の石畳の色（岸の縁の帯と、沖側のならした斜面）。なければnull
  const L=PRH.get(Math.floor(x/PRC)+','+Math.floor(z/PRC));if(!L)return null;
  for(const p of L){
    const dx=x-p.ox,dz=z-p.oz,a=dx*p.tx+dz*p.tz,b=dx*p.nx+dz*p.nz;
    if(Math.abs(a)<=PA+14&&b>=-17&&b<=3){const n=(vnoise(x*.45,z*.45)-.5)*.1;return b<-4?[.5+n,.49+n,.46+n]:[.6+n,.58+n,.54+n]}
  }
  return null;
}
function portNear(x,z,m){                                        // 港町の敷地（岸壁の帯＋m）の中か。木を生やさない範囲に使う
  const L=PRH.get(Math.floor(x/PRC)+','+Math.floor(z/PRC));if(!L)return false;
  for(const p of L){const dx=x-p.ox,dz=z-p.oz,a=dx*p.tx+dz*p.tz,b=dx*p.nx+dz*p.nz;if(Math.abs(a)<PA+m+14&&b>-20&&b<(p.inl?PB1+75:PB1)+m)return true}
  return false;
}
function coastNear(x,z){                                         // 1〜1.5km先に深い海があるか（帝国の諸侯の街を海沿いに寄せる）
  for(let j=0;j<12;j++){const c=Math.cos(j*.5236),s=Math.sin(j*.5236);for(const d of[1000,1250,1500])if(rawH(x+c*d,z+s*d)<WATER-1.5)return true}
  return false;
}
function findPortCell(cx,cz){                                    // セル(cx,cz)の中で、海岸を探して港町を1つ作る（帝国は使わない）
  const k=cx+','+cz;if(portCells.has(k))return;portCells.add(k);
  const r=mulberry(hash(cx,cz,SEED+6363)*1e9|0);
  let made=0;
  const sx=(cx+.2+r()*.6)*PTC,sz=(cz+.2+r()*.6)*PTC,a0=r()*6.2832;
  for(let k2=0;k2<36;k2++){
    const ang=a0+k2*6.2832/36,cs=Math.cos(ang),sn=Math.sin(ang);
    let hit=-1,prevLand=rawH(sx,sz)>=WATER-1.5;
    for(let d=60;d<=1700;d+=60){
      const h=rawH(sx+cs*d,sz+sn*d);
      if(h<WATER-1.5){if(prevLand){hit=d;break}}else prevLand=true;
    }
    if(hit<0)continue;
    let lo=hit-60,hi=hit;for(let i=0;i<8;i++){const m=(lo+hi)/2;if(rawH(sx+cs*m,sz+sn*m)<WATER-1.5)hi=m;else lo=m}
    const Px=sx+cs*hi,Pz=sz+sn*hi;
    let ax=0,az=0;for(let j=0;j<16;j++){const aj=j*.3927,qx=Px+Math.cos(aj)*90,qz=Pz+Math.sin(aj)*90;if(rawH(qx,qz)<WATER-1){ax+=Math.cos(aj);az+=Math.sin(aj)}}   // 海のある向き（岸の法線）
    const base=Math.hypot(ax,az)>2?Math.atan2(az,ax):ang;
    site:for(const da of[0,.26,-.26,.52,-.52])for(const s of[0,8,-8,16,-16,24,-24,32,-32,40,-40,48,-48,56,-56,64,-64,72,-72,80,-80]){
      const a2=base+da,ns=[Math.cos(a2),Math.sin(a2)],p=tryPort(null,Px+ns[0]*s,Pz+ns[1]*s,-ns[0],-ns[1]);
      if(p){PORTS.push(p);portRegister(p);makePortTown(p);if(++made>=2)return;break site}
    }
  }
}
function ensurePorts(ix,iz){
  if(!GEN_OTHER_TOWNS){
    if(!GEN_PORT_TOWNS)return;
    const x0=(ix-1)*MC,x1=(ix+2)*MC,z0=(iz-1)*MC,z1=(iz+2)*MC;      // 周り3x3区画に重なるセルの港町を作っておく
    for(let cx=Math.floor(x0/PTC);cx<=Math.floor((x1-1)/PTC);cx++)for(let cz=Math.floor(z0/PTC);cz<=Math.floor((z1-1)/PTC);cz++){
      try{findPortCell(cx,cz)}catch(err){console.error(err);EU_ERR='港町: '+(err&&err.message)}
    }
    return;
  }                                    // 港町（生成停止中）                                     // この位置の周り(MC区画3x3)に重なる帝国の港町を作っておく
  const B=EMB*TCELL,x0=(ix-1)*MC,x1=(ix+2)*MC,z0=(iz-1)*MC,z1=(iz+2)*MC;
  for(let bx=Math.floor(x0/B);bx<=Math.floor((x1-1)/B);bx++)for(let bz=Math.floor(z0/B);bz<=Math.floor((z1-1)/B);bz++){
    const E=empireOf(bx,bz);if(!E||!E.seats||E.portsDone)continue;
    E.portsDone=true;
    try{findPorts(E)}catch(err){console.error(err);EU_ERR='港町: '+(err&&err.message)}
  }
}
function tryPort(E,ox,oz,nx,nz){
  let vk0=1.45,inl0=false;                                 // (ox,oz)=海岸線の目安の点, (nx,nz)=陸側の向き。条件を満たせば港を返す
  const tx=nz,tz=-nx,W=(a,b)=>[ox+a*tx+b*nx,oz+a*tz+b*nz];
  let q;
  let noSea=0,noLand=0;                                           // 海岸線は多少ギザギザでよい（9本の筋のうち2本までは外れてよい）
  for(let a=-PA;a<=PA;a+=28){
    q=W(a,-14);if(rawH(q[0],q[1])>=WATER-1)noSea++;               // 岸壁のすぐ沖は海
    q=W(a,PB1);if(rawH(q[0],q[1])<=WATER+2.5)noLand++;            // 奥まで陸が続く
  }
  if(noSea>2||noLand>2)return null;
  for(const[a,b]of[[0,-90],[-70,-70],[70,-70]]){q=W(a,b);if(rawH(q[0],q[1])>=WATER-1)return null}   // 沖は広い海
  if(E){
    for(const[a,b]of[[-PA,PB1],[0,PB1],[PA,PB1],[-PA,0],[PA,0],[0,0]]){q=W(a,b);if(empD(E,q[0],q[1])>-120)return null}   // 領土の内側（国境の水路から離れる）
    for(const s of E.seats)if(Math.hypot(ox-s.x,oz-s.z)<1100)return null;                              // 王都・諸侯の街から離れる
    for(const p of E.ports)if(Math.hypot(ox-p.ox,oz-p.oz)<600)return null;
  }else{                                                           // 単独の港町: 砂漠・他の港・砂漠の街・川の街と重ならない
    const c0=W(0,36),cl=climateAt(c0[0],c0[1]);if(cl.de>=.5||cl.gr+cl.bf+cl.ta+cl.tf+cl.cg<.4)return null;   // 村と同じ: 砂漠を除外し、草原か森にだけ作る
    for(const p of PORTS)if(Math.hypot(ox-p.ox,oz-p.oz)<350)return null;
    for(const a of[-PA,0,PA])for(const b of[0,44,88]){q=W(a,b);if(townW(q[0],q[1])>0)return null}
    const inl=inl0=mulberry(hash(Math.round(ox),Math.round(oz),SEED+8181)*1e9|0)()<.3;      // 30%: 内陸にも広がる港町（奥に通りを足し、条件をゆるめる）
    const vk=vk0=(1.15+.5*mulberry(hash(Math.round(ox),Math.round(oz),SEED+7171)*1e9|0)())*(inl?1.25:1);   // 村ごとに条件の緩さを変える（1.15〜1.65）
    let miss=0,tot=0;                                                // 村と同じ「居住可能エリア」(habRaw)か。陸側の街の敷地を調べ、居住不可の割合が小さいこと
    for(const a of[-84,-42,0,42,84])for(const b of[14,36,58,80]){q=W(a,b);tot++;if(!habK(q[0],q[1],vk))miss++}
    if(miss/tot>.55*vk/1.45)return null;
    for(const a of[-PA,-56,0,56,PA])for(const b of[6,36,66]){q=W(a,b);if(villageSep(q[0],q[1])<VSEP)return null}   // 川沿いの村の道から離す
  }
  for(const a of[-PA,0,PA])for(const b of[-10,6,36,66]){q=W(a,b);if(riverScan(q[0],q[1])&&RN_E<40)return null}   // 河口は避ける
  const hs=[];for(const a of[-84,0,84])for(const b of[20,50,80]){q=W(a,b);hs.push(rawH(q[0],q[1]))}
  const so=hs.slice().sort((u,v)=>u-v),Hq=Math.max(WATER+2.2,Math.min(WATER+3.6,so[4]));
  for(const h of hs)if(Math.abs(h-Hq)>11)return null;               // 切り土・盛り土が大きすぎる所は避ける
  return{ox,oz,tx,tz,nx,nz,Hq,E,vk:E?1.45:vk0,inl:E?false:inl0};
}
function findPorts(E){
  E.ports=[];
  const r=mulberry(hash(E.bx,E.bz,SEED+6363)*1e9|0);
  for(const sd of E.seats){
    const a0=r()*6.2832;let made=false;
    for(let k=0;k<36&&!made;k++){
      const ang=a0+k*6.2832/36,cs=Math.cos(ang),sn=Math.sin(ang);
      let hit=-1;
      for(let d=500;d<=sd.R*1.3;d+=60){
        const x=sd.x+cs*d,z=sd.z+sn*d;
        if(empD(E,x,z)>-150)break;
        if(rawH(x,z)<WATER-1.5){hit=d;break}
      }
      if(hit<0)continue;
      let lo=hit-60,hi=hit;for(let i=0;i<8;i++){const m=(lo+hi)/2;if(rawH(sd.x+cs*m,sd.z+sn*m)<WATER-1.5)hi=m;else lo=m}
      const Px=sd.x+cs*hi,Pz=sd.z+sn*hi;
      let sx=0,sz=0;for(let j=0;j<16;j++){const aj=j*.3927,qx=Px+Math.cos(aj)*90,qz=Pz+Math.sin(aj)*90;if(rawH(qx,qz)<WATER-1){sx+=Math.cos(aj);sz+=Math.sin(aj)}}   // 海のある向き（岸の法線）
      const base=Math.hypot(sx,sz)>2?Math.atan2(sz,sx):ang;
      outer:for(const da of[0,.26,-.26,.52,-.52])for(const s of[0,8,-8,16,-16,24,-24,32,-32,40,-40,48,-48,56,-56,64,-64,72,-72,80,-80]){
        const a2=base+da,ns=[Math.cos(a2),Math.sin(a2)],p=tryPort(E,Px+ns[0]*s,Pz+ns[1]*s,-ns[0],-ns[1]);
        if(p){E.ports.push(p);PORTS.push(p);portRegister(p);makePortTown(p);made=true;break outer}
      }
    }
  }
}
function makePortTown(p){                                        // 港町の「村」データ。海岸線にある程度沿った岸壁通りを元に、地形（高低差）に沿った道を内陸へ伸ばし、先の方をつなぐ。家は近づいた時に buildVillage が道に沿って置く
  const W=(a,b)=>[p.ox+a*p.tx+b*p.nx,p.oz+a*p.tz+b*p.nz];
  const LA=(x,z)=>{const dx=x-p.ox,dz=z-p.oz;return[dx*p.tx+dz*p.tz,dx*p.nx+dz*p.nz]};          // 世界座標→局所(a,b)
  const r=mulberry(hash(Math.round(p.ox),Math.round(p.oz),SEED+6464)*1e9|0);
  const hf=(x,z)=>{const h=rawH(x,z),pf=portFlat(x,z);return pf?h+(pf[1]-h)*pf[0]:h};          // 岸壁の平らな帯を含む地面の高さ（heightAtを呼ばない）
  const maxB=p.inl?230:150,maxA=PA+(p.inl?70:36),th0=Math.atan2(p.nz,p.nx),ang=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const okPt=(x,z)=>{const[a,b]=LA(x,z);return Math.abs(a)<=maxA&&b>=2&&b<=maxB};              // 街の範囲（局所座標）
  // ① 岸壁通り: 海岸線（海との境）をなぞり、平らにならした帯の中でゆるやかに曲げる
  const sh=[];for(let a=-PA;a<=PA;a+=8){let b=-14;while(b<44&&rawH(...W(a,b))<WATER-.5)b+=2;sh.push(b)}
  const sm=sh.map((v,i)=>{let t=0,n=0;for(let j=-2;j<=2;j++){const q=sh[i+j];if(q!==undefined){t+=q;n++}}return t/n});
  const M=sm.map((v,i)=>{const a=-PA+i*8,w=(vnoise(a*.035+p.ox*.001,p.oz*.001+3.3)-.5)*7;return W(a,Math.max(4,Math.min(18,6+Math.max(-5,Math.min(8,v*.4))+w)))});
  const net=[M],polys=[],roads=[],extra=[];
  // ② 内陸への道: 岸壁通りから、高低差の小さい向きを選んで曲がりながら伸ばす（枝道どうしは離す）
  const grow=(s0,t0,maxLen)=>{
    const pl=[[s0[0],s0[1]]];let th=t0,x=s0[0],z=s0[1],h=hf(x,z),len=0;
    while(len<maxLen){
      let best=null,bc=1e9;
      for(let k=-3;k<=3;k++){
        const a=th+k*.21,qx=x+Math.cos(a)*VST,qz=z+Math.sin(a)*VST;
        if(Math.abs(ang(a,t0))>1.05||!okPt(qx,qz))continue;
        const hq=hf(qx,qz);if(hq<WATER+1.8||Math.abs(hq-h)>VDH*1.25)continue;                  // 水・段差を避ける
        if(netDist(net,qx,qz,[s0[0],s0[1],VGAP*1.4])<VGAP)continue;                              // 他の道に近すぎる
        if(villageSep(qx,qz)<60)continue;
        const cost=Math.abs(hq-h)*2.5+Math.abs(k)*.45+r()*.6;
        if(cost<bc){bc=cost;best=[a,qx,qz,hq]}
      }
      if(!best)break;
      th=best[0];x=best[1];z=best[2];h=best[3];pl.push([x,z]);len+=VST;
    }
    return pl;
  };
  const br=[];
  for(let i=2+Math.floor(r()*3);i<M.length-2;i+=4+Math.floor(r()*3)){
    const pl=grow(M[i],th0+(r()-.5)*.5,(p.inl?110:62)+r()*(p.inl?110:50));
    if(pl.length>=4){net.push(pl);br.push({i,pl})}
  }
  // ③ 枝道の先どうしを、地形に沿った道でつなぐ（行き止まりを減らし、ぐるっと回れるようにする）
  const link=(A,B)=>{
    const pl=[[A[0],A[1]]];let x=A[0],z=A[1],h=hf(x,z);
    for(let n=0;n<44;n++){
      const dx=B[0]-x,dz=B[1]-z,d=Math.hypot(dx,dz);if(d<=VST*1.2){pl.push([B[0],B[1]]);return pl}
      const t=Math.atan2(dz,dx);let best=null,bc=1e9;
      for(let k=-3;k<=3;k++){
        const a=t+k*.3,qx=x+Math.cos(a)*VST,qz=z+Math.sin(a)*VST;
        if(!okPt(qx,qz))continue;const hq=hf(qx,qz);if(hq<WATER+1.8||Math.abs(hq-h)>VDH*1.25)continue;
        const cost=Math.abs(hq-h)*2.5+Math.abs(k)*.5+r()*.4;if(cost<bc){bc=cost;best=[qx,qz,hq]}
      }
      if(!best)return null;
      x=best[0];z=best[1];h=best[2];pl.push([x,z]);
    }
    return null;
  };
  const lk=[];
  for(let j=0;j+1<br.length;j++){
    const A=br[j].pl,B=br[j+1].pl,a0=A[A.length-1],b0=B[B.length-1];
    if(Math.hypot(a0[0]-b0[0],a0[1]-b0[1])>(p.inl?190:130))continue;
    const pl=link(a0,b0);if(pl&&pl.length>=3){lk.push(pl);net.push(pl)}
    else{const m=Math.min(A.length,B.length)>>1,pl2=link(A[m],B[m]);if(pl2&&pl2.length>=3){lk.push(pl2);net.push(pl2)}}   // 先がつながらなければ中ほどでつなぐ
  }
  // 道（見た目・当たり）と、家を並べる線に変換
  const addPoly=(pl,house)=>{
    for(let i=0;i+1<pl.length;i++)roads.push([pl[i][0],pl[i][1],pl[i+1][0],pl[i+1][1]]);
    if(house)for(let i=0;i+1<pl.length;i+=3){const a=pl[i],b=pl[Math.min(i+3,pl.length-1)];if(Math.hypot(b[0]-a[0],b[1]-a[1])>=8)extra.push({a,b,inl:LA(a[0],a[1])[1]>PB1-10})}
  };
  addPoly(M,false);for(const q of br)addPoly(q.pl,true);for(const pl of lk)addPoly(pl,true);
  const c=W(0,40),v={cx:c[0],cz:c[1],s:1,vx:p.inl?1.7:1,M,B:null,M2:null,B2:null,twin:false,ck:[],bk:[],roads,P:M.map(q=>({x:q[0],z:q[1]})),i0:0,houses:null,deck:null,fields:[],fcircs:null,manor:null,port:p,extra,k:p.vk};
  v.settlementType='port';v.label=settlementLabel(v,'port');
  const nr0=roads.length;
  {const ends=[];for(const q of br){const pl=q.pl,a=pl[pl.length-1],b=pl[pl.length-2];ends.push({p:a,th:Math.atan2(a[1]-b[1],a[0]-b[0])})}
    try{villageCastle(v,ends,hf)}catch(err){console.error(err)}}       // 確率で、道を少し伸ばした先に城を置く
  try{                                                                  // 街と城をぐるっと囲む壁（城の有無に関わらず）。城へ向かう道の先は城の中なので門は作らない
    const cs=roads.length>nr0?[roads[nr0][0],roads[nr0][1]]:null,brEnds=br.map(q=>q.pl[q.pl.length-1]).filter(e=>!(cs&&Math.hypot(e[0]-cs[0],e[1]-cs[1])<3));
    const wl=portWallPath(p,v,hf,brEnds);if(wl){v.wall={pts:wl.pts,gates:wl.gates};for(const g of wl.roads)roads.push(g)}
  }catch(err){console.error(err)}
  VLIST.push(v);vRegister(v);p.v=v;
}
// ---------- 港町の城壁 ----------
// 街の道と城をぐるっと囲む壁（海から海へ。城の有無に関わらず作る）。岸に沿う向きaごとに「陸側へどこまで道があるか」を調べて輪郭を作り、
// 両端は岸（水）まで下ろす。壁は地面より約6.5m高く、地面の下4mまで埋める（斜面でも浮かない）。道の先の近くに門を最大2か所。
const PW_S=5,PW_R=22,PW_T=1.3,PW_H=6.5;
function portWallPath(p,v,hf,brEnds){
  const LA=(x,z)=>{const dx=x-p.ox,dz=z-p.oz;return[dx*p.tx+dz*p.tz,dx*p.nx+dz*p.nz]};
  const W=(a,b)=>[p.ox+a*p.tx+b*p.nx,p.oz+a*p.tz+b*p.nz];
  const pts=[];
  for(const s of v.roads){const l=Math.hypot(s[2]-s[0],s[3]-s[1]),n=Math.max(1,Math.ceil(l/8));for(let k=0;k<=n;k++)pts.push(LA(s[0]+(s[2]-s[0])*k/n,s[1]+(s[3]-s[1])*k/n))}
  if(v.castle){const k=v.castle,c=Math.cos(k.ry),s=Math.sin(k.ry);for(const[u,w]of[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]){const lx=u*k.w/2,lz=w*k.d/2;pts.push(LA(k.x+lx*c+lz*s,k.z-lx*s+lz*c))}}
  if(pts.length<4)return null;
  let mnA=1e9,mxA=-1e9;for(const q of pts){mnA=Math.min(mnA,q[0]);mxA=Math.max(mxA,q[0])}
  const a0=mnA-PW_R+.5,n=Math.floor((mxA+PW_R-.5-a0)/PW_S);
  const E=[];
  for(let i=0;i<=n;i++){const a=a0+i*PW_S;let e=-1e9;for(const q of pts){const da=a-q[0];if(Math.abs(da)<PW_R){const b=q[1]+Math.sqrt(PW_R*PW_R-da*da);if(b>e)e=b}}E.push(e)}
  for(let i=0;i<=n;i++)if(E[i]<-1e8){let j=i;while(j>=0&&E[j]<-1e8)j--;let k=i;while(k<=n&&E[k]<-1e8)k++;E[i]=Math.max(E[j]===undefined?-1e9:E[j],E[k]===undefined?-1e9:E[k])}
  const E2=E.map((e,i)=>i>0&&i<n?(E[i-1]+e+E[i+1])/3:e);
  const top=E2.map((e,i)=>W(a0+i*PW_S,Math.max(e,24)));
  const leg=(a,b0)=>{const out=[];for(let b=b0-PW_S;b>=-14;b-=PW_S){const q=W(a,b);if(hf(q[0],q[1])<WATER+.3)break;out.push(q)}return out};
  const Lg=leg(a0,Math.max(E2[0],24)).reverse(),Rg=leg(a0+n*PW_S,Math.max(E2[n],24));
  const path=Lg.concat(top,Rg);
  const rs=[path[0]];let carry=0;
  for(let i=1;i<path.length;i++){const A=path[i-1],B=path[i],l=Math.hypot(B[0]-A[0],B[1]-A[1]);let t=PW_S-carry;while(t<=l){rs.push([A[0]+(B[0]-A[0])*t/l,A[1]+(B[1]-A[1])*t/l]);t+=PW_S}carry=l-(t-PW_S)}
  if(carry>1.5)rs.push(path[path.length-1]);
  if(rs.length<10)return null;
  const cand=[];
  for(const e of brEnds){let bj=-1,bd=1e9;for(let j=3;j<rs.length-4;j++){const d=Math.hypot(rs[j][0]-e[0],rs[j][1]-e[1]);if(d<bd){bd=d;bj=j}}if(bj>=0&&bd<80)cand.push({e,j:bj,d:bd})}
  cand.sort((u,w)=>u.d-w.d);
  const gates=[],roads=[];
  for(const c of cand){if(gates.length>=2)break;if(gates.some(g=>Math.abs(g-c.j)<8))continue;
    const gi=c.j,A=rs[gi],B=rs[gi+1],mx=(A[0]+B[0])/2,mz=(A[1]+B[1])/2,dx=mx-c.e[0],dz=mz-c.e[1],l=Math.hypot(dx,dz)||1;
    gates.push(gi);roads.push([c.e[0],c.e[1],mx,mz]);roads.push([mx,mz,mx+dx/l*14,mz+dz/l*14]);
  }
  return{pts:rs,gates,roads};
}
function villageWallPath(v,hf,ends,skipEnd){                      // 川沿いの村: 道・畑・城をぐるっと囲む輪郭（閉じた輪）。段差があれば高い所（上の縁）に壁を寄せ、なければそのまま一周する
  const R=18,N=72,pts=[];
  for(const s of v.roads){const l=Math.hypot(s[2]-s[0],s[3]-s[1]),n=Math.max(1,Math.ceil(l/8));for(let k=0;k<=n;k++)pts.push([s[0]+(s[2]-s[0])*k/n,s[1]+(s[3]-s[1])*k/n])}
  for(const f of(v.fields||[])){pts.push([f.cx,f.cz]);for(const q of fieldCorners(f))pts.push(q)}
  if(v.castle){const k=v.castle,c=Math.cos(k.ry),s=Math.sin(k.ry);for(const[u,w]of[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]){const lx=u*k.w/2,lz=w*k.d/2;pts.push([k.x+lx*c+lz*s,k.z-lx*s+lz*c])}}
  if(pts.length<4)return null;
  let cx=0,cz=0;for(const q of pts){cx+=q[0];cz+=q[1]}cx/=pts.length;cz/=pts.length;
  const r=[];
  for(let k=0;k<N;k++){const th=k/N*6.2832,ux=Math.cos(th),uz=Math.sin(th);let best=-1e9;
    for(const q of pts){const dx=q[0]-cx,dz=q[1]-cz,perp=-dx*uz+dz*ux;if(Math.abs(perp)<R){const e=dx*ux+dz*uz+Math.sqrt(R*R-perp*perp);if(e>best)best=e}}
    r.push(best)}
  for(let k=0;k<N;k++)if(r[k]<-1e8){let a=k,b=k,i=0;while(r[(a+N)%N]<-1e8&&i<N){a--;i++}i=0;while(r[b%N]<-1e8&&i<N){b++;i++}r[k]=Math.max(r[(a+N)%N],r[b%N])}
  const r2=r.map((e,k)=>Math.max(24,(r[(k+N-1)%N]+e+r[(k+1)%N])/3));
  const r3=r2.map((e,k)=>{                                         // 段差（窓の高低差が5m超）があれば、最も高い所（上の縁）に寄せる。内側へは8m、外側へは24mまで
    const th=k/N*6.2832,ux=Math.cos(th),uz=Math.sin(th),hs=[];let mx=-1e9,mn=1e9;
    for(let d=-8;d<=24;d+=3){const h=hf(cx+ux*(e+d),cz+uz*(e+d));hs.push([d,h]);if(h>WATER+.3){mx=Math.max(mx,h);mn=Math.min(mn,h)}}
    if(mx<-1e8||mx-mn<=5)return e;
    let bd=1e9;for(const[d,h]of hs)if(h>WATER+.3&&h>=mx-1.5&&Math.abs(d)<Math.abs(bd))bd=d;
    return bd===1e9?e:e+bd;
  });
  for(let it=0;it<2*N;it++){const k=it%N,p=r3[(k+N-1)%N];r3[k]=Math.max(r2[k]-8,Math.min(p+12,Math.max(p-12,r3[k])))}   // 隣どうしの飛びを抑える
  const path=r3.map((e,k)=>{const th=k/N*6.2832;return[cx+Math.cos(th)*e,cz+Math.sin(th)*e]});path.push(path[0]);
  const rs=[path[0]];let carry=0;
  for(let i=1;i<path.length;i++){const A=path[i-1],B=path[i],l=Math.hypot(B[0]-A[0],B[1]-A[1]);let t=PW_S-carry;while(t<=l){rs.push([A[0]+(B[0]-A[0])*t/l,A[1]+(B[1]-A[1])*t/l]);t+=PW_S}carry=l-(t-PW_S)}
  if(Math.hypot(rs[rs.length-1][0]-rs[0][0],rs[rs.length-1][1]-rs[0][1])<2.5)rs.pop();
  if(rs.length<12)return null;
  const cand=[];
  for(const e of ends){let bj=-1,bd=1e9;for(let j=0;j<rs.length;j++){const d=Math.hypot(rs[j][0]-e[0],rs[j][1]-e[1]);if(d<bd){bd=d;bj=j}}if(bj>=0&&bd<80)cand.push({e,j:bj,d:bd})}
  cand.sort((u,w)=>u.d-w.d);
  const gates=[],roads=[],nn=rs.length;
  for(const c of cand){if(gates.length>=3)break;if(gates.some(g=>{const dd=Math.abs(g-c.j);return Math.min(dd,nn-dd)<8}))continue;
    const gi=c.j,A=rs[gi],B=rs[(gi+1)%nn],mx=(A[0]+B[0])/2,mz=(A[1]+B[1])/2,dx=mx-c.e[0],dz=mz-c.e[1],l=Math.hypot(dx,dz)||1;
    gates.push(gi);roads.push([c.e[0],c.e[1],mx,mz]);roads.push([mx,mz,mx+dx/l*14,mz+dz/l*14]);
  }
  return{pts:rs,gates,roads,closed:true,c:[cx,cz]};
}
function pwallD(w,x,z){const P=w.pts,n=P.length;let d=1e9;for(let i=0;i<(w.closed?n:n-1);i++){const B=P[(i+1)%n],ax=P[i][0],az=P[i][1],dx=B[0]-ax,dz=B[1]-az;let t=((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1);t=t<0?0:t>1?1:t;const e=Math.hypot(x-ax-dx*t,z-az-dz*t);if(e<d)d=e}return d}
function pwallHit(w,cn){                                          // 家(4隅)が壁にかかるか
  const cx=(cn[0][0]+cn[2][0])/2,cz=(cn[0][1]+cn[2][1])/2;if(pwallD(w,cx,cz)<5.5)return true;
  for(let k=0;k<4;k++){const a=cn[k],b=cn[(k+1)%4];if(pwallD(w,a[0],a[1])<4.5||pwallD(w,(a[0]+b[0])/2,(a[1]+b[1])/2)<4.5)return true}
  return false;
}
function drawPortWall(v,quad,H){                                  // 港町・村の壁・塔・門（開いた線も閉じた輪も）。戻り値は当たり判定の円
  const w=v.wall,P=w.pts,n=P.length,circs=[],gs=new Set(w.gates||[]),cl=!!w.closed,cc=w.c||[v.cx,v.cz],md=k=>cl?((k%n)+n)%n:k;
  const STONES=[0x9a968c,0x928e84,0x9f9b90],DARK2=0x8a867c,LIGHT=0xc8c0ae,TOPC=0xb8b2a2,SLATE=0x3e4553,DK=0x1d1a18,IRON=0x2e2d30;
  const RV=P.map(q=>{const e=riverEff(q[0],q[1]);return e<.8?RN_B+.95+.06*RN_HW:null});   // 川の中の点は水面の高さ（なければnull）。川を横切る所は壁の下を開けて格子にする
  const rvNear=i=>{for(let k=-2;k<=2;k++){const m=cl?md(i+k):i+k;if(m>=0&&m<n&&RV[m]!==null)return true}return false};
  const G=P.map(q=>H(q[0],q[1])),gAt=k=>Math.max(G[md(k)],WATER),wat=G.map(g=>g<WATER+.3);   // 湖・海に入った所は壁を切る（港の壁の端と同じ: 岸で終わらせて塔を建てる）
  const drawn=i=>{if(!cl&&(i<0||i>=n-1))return false;return!wat[md(i)]&&!wat[md(i+1)]};
  const top=G.map((g,i)=>{let s=0,c=0;for(let j=-3;j<=3;j++){const q=cl||(i+j>=0&&i+j<n)?gAt(i+j):undefined;if(q!==undefined){s+=q;c++}}return Math.max(s/c+PW_H,Math.max(g,WATER)+5.5)});
  const lo=G.map((g,i)=>Math.min(g,cl||i>0?gAt(i-1):g,cl||i<n-1?gAt(i+1):g)-4);
  const dirAt=i=>{const A=P[cl?md(i-1):Math.max(0,i-1)],B=P[cl?md(i+1):Math.min(n-1,i+1)],dx=B[0]-A[0],dz=B[1]-A[1],l=Math.hypot(dx,dz)||1;return[dx/l,dz/l]};
  const near=(a,b)=>{const d=Math.abs(a-b);return cl?Math.min(d,n-d):d};
  const bx=(cx,cz,ux,uz,sx,sz,y0,y1,color)=>{                       // 向き(ux,uz)の直方体（底面なし）
    const vx=-uz,vz=ux,hx=sx/2,hz=sz/2,c=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([a,b])=>[cx+ux*a+vx*b,cz+uz*a+vz*b]),R=[cx,(y0+y1)/2,cz];
    for(let k=0;k<4;k++){const a=c[k],b=c[(k+1)%4];quad([a[0],y0,a[1]],[b[0],y0,b[1]],[b[0],y1,b[1]],[a[0],y1,a[1]],color,R)}
    quad([c[0][0],y1,c[0][1]],[c[1][0],y1,c[1][1]],[c[2][0],y1,c[2][1]],[c[3][0],y1,c[3][1]],color,R);
  };
  const pyr=(cx,cz,ux,uz,half,y,rise,color)=>{const vx=-uz,vz=ux,A=[cx,y+rise,cz],R=[cx,y+rise/2,cz],K=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[cx+ux*a*half+vx*b*half,y,cz+uz*a*half+vz*b*half]);for(let k=0;k<4;k++)quad(K[k],K[(k+1)%4],A,A,color,R)};
  const tower=(cx,cz,ux,uz,yTop)=>{
    const vx=-uz,vz=ux;let g=H(cx,cz);for(const[a,b]of[[-3.2,-3.2],[3.2,-3.2],[3.2,3.2],[-3.2,3.2]])g=Math.min(g,H(cx+ux*a+vx*b,cz+uz*a+vz*b));
    const yb=g-4,y1=yTop+4.5;
    bx(cx,cz,ux,uz,6.4,6.4,yb,y1,STONES[0]);bx(cx,cz,ux,uz,7.2,7.2,y1,y1+.6,LIGHT);pyr(cx,cz,ux,uz,4.1,y1+.6,7,SLATE);
    for(const[du,dv]of[[1,0],[-1,0],[0,1],[0,-1]]){const fx=du*ux+dv*vx,fz=du*uz+dv*vz,px=-fz,pz=fx,qx=cx+fx*3.25,qz=cz+fz*3.25,ys=yTop+1.2;
      quad([qx-px*.3,ys,qz-pz*.3],[qx+px*.3,ys,qz+pz*.3],[qx+px*.3,ys+1.9,qz+pz*.3],[qx-px*.3,ys+1.9,qz-pz*.3],DK,[cx,ys,cz])}
    circs.push([cx,cz,3.3]);for(const[a,b]of[[-2.4,-2.4],[2.4,-2.4],[2.4,2.4],[-2.4,2.4]])circs.push([cx+ux*a+vx*b,cz+uz*a+vz*b,1.7]);
  };
  const capT=new Set();
  for(let i=0;i<(cl?n:n-1);i++){
    const j=md(i+1),A=P[i],B=P[j];if(!drawn(i))continue;
    const dx=B[0]-A[0],dz=B[1]-A[1],l=Math.hypot(dx,dz)||1,ux=dx/l,uz=dz/l,nx=-uz,nz=ux,mx=(A[0]+B[0])/2,mz=(A[1]+B[1])/2,gate=gs.has(i);
    const s=((mx-cc[0])*nx+(mz-cc[1])*nz)>=0?1:-1,rvr=!gate&&(RV[i]!==null||RV[j]!==null),sw=Math.max(RV[i]===null?-1e9:RV[i],RV[j]===null?-1e9:RV[j]),op=gate||rvr;
    const gy=gate?Math.max(G[i],G[j])+4.8:Math.min(Math.max(top[i],top[j])-1.2,sw+3.4);   // 門・川の開口の上端
    const yA=op?gy:lo[i],yB=op?gy:lo[j],tA=top[i],tB=top[j],R=[mx,((yA+yB)/2+(tA+tB)/2)/2,mz],col=STONES[i%3];
    const pa=(o,y)=>[A[0]+nx*o,y,A[1]+nz*o],pb=(o,y)=>[B[0]+nx*o,y,B[1]+nz*o];
    quad(pa(PW_T,yA),pb(PW_T,yB),pb(PW_T,tB),pa(PW_T,tA),col,R);
    quad(pa(-PW_T,yA),pb(-PW_T,yB),pb(-PW_T,tB),pa(-PW_T,tA),col,R);
    quad(pa(PW_T,tA),pb(PW_T,tB),pb(-PW_T,tB),pa(-PW_T,tA),TOPC,R);
    if(op)quad(pa(PW_T,yA),pb(PW_T,yB),pb(-PW_T,yB),pa(-PW_T,yA),DARK2,R);
    if(rvr){                                                       // 川: 壁の下に鉄格子（縦棒と横棒2本）。水は格子の間を通る
      for(let t=.45;t<l;t+=.9){const g0=G[i]+(G[j]-G[i])*t/l-.6;bx(A[0]+ux*t,A[1]+uz*t,ux,uz,.2,.2,g0,gy+.1,IRON)}
      for(const hy of[sw+.6,sw+2])bx(mx,mz,ux,uz,l,.2,Math.min(hy,gy-.4),Math.min(hy,gy-.4)+.2,IRON);
    }
    if(rvr){const pi=md(i-1),ni=md(i+1),pOpen=drawn(i-1)&&(gs.has(pi)||RV[pi]!==null||RV[i]!==null),nOpen=drawn(i+1)&&(gs.has(ni)||RV[ni]!==null||RV[j]!==null);   // 開口の両端の壁の断面（袖）
      if(!pOpen&&drawn(i-1))quad(pa(PW_T,lo[i]),pa(-PW_T,lo[i]),pa(-PW_T,yA),pa(PW_T,yA),col,R);
      if(!nOpen&&drawn(i+1))quad(pb(PW_T,lo[j]),pb(-PW_T,lo[j]),pb(-PW_T,yB),pb(PW_T,yB),col,R)}
    if(!drawn(i-1)){quad(pa(PW_T,yA),pa(-PW_T,yA),pa(-PW_T,tA),pa(PW_T,tA),col,R);capT.add(i)}
    if(!drawn(i+1)){quad(pb(PW_T,yB),pb(-PW_T,yB),pb(-PW_T,tB),pb(PW_T,tB),col,R);capT.add(j)}
    if(!gate){
      for(const t of[1.25,3.75]){if(t>l)continue;const yb=tA+(tB-tA)*t/l-.3;bx(A[0]+ux*t+nx*s*(PW_T-.45),A[1]+uz*t+nz*s*(PW_T-.45),ux,uz,1.5,.9,yb,yb+1.6,DARK2);circs.push([A[0]+ux*t,A[1]+uz*t,1.9])}
    }
  }
  for(let i=cl?0:1;i<(cl?n:n-1);i++){                              // 継ぎ目の控え壁（折れ曲がりのすき間を隠す）
    if(gs.has(i)||gs.has(md(i-1))||!drawn(i-1)||!drawn(i))continue;const d=dirAt(i);bx(P[i][0],P[i][1],d[0],d[1],3,3,lo[i],top[i]+.25,DARK2);
  }
  for(let i=0;i<n;i++){                                            // 塔: （開いた線は両端と）約45mごと。門の近くは門の塔にまかせる
    if(wat[i])continue;const cap=capT.has(i);if(!cap&&(i%9!==4||w.gates.some(g=>near(g,i)<=3)||!drawn(i-1)||!drawn(i)||rvNear(i)))continue;   // 川の近くは塔を建てず壁だけにする
    const d=dirAt(i);tower(P[i][0],P[i][1],d[0],d[1],top[i]);
  }
  for(const gi of w.gates){                                        // 門の左右の塔
    const gj=md(gi+1),A=P[gi],B=P[gj],l=Math.hypot(B[0]-A[0],B[1]-A[1])||1,ux=(B[0]-A[0])/l,uz=(B[1]-A[1])/l,mx=(A[0]+B[0])/2,mz=(A[1]+B[1])/2,yT=Math.max(top[gi],top[gj]);
    if(rvNear(gi)||rvNear(gj))continue;
    for(const sg of[-1,1])tower(mx+ux*sg*(l/2+3.2),mz+uz*sg*(l/2+3.2),ux,uz,yT);
  }
  return circs;
}
function portBuild(p,quad,deck){                                 // 桟橋・岸壁の縁石・防波堤と灯台・船・積み荷。戻り値は当たり判定の円
  const H=p.Hq,WY=WATER,circs=[],r=mulberry(hash(Math.round(p.ox),Math.round(p.oz),SEED+6464)*1e9|0);
  const P3=(a,b,y)=>[p.ox+a*p.tx+b*p.nx,y,p.oz+a*p.tz+b*p.nz];
  const box=(a,b,y0,sa,sb,sh,color)=>{                            // 岸に沿う向きにそろえた直方体（中心a,b・下端y0・大きさ sa×sb×sh）
    const V=(i,j,k)=>P3(a+(i-.5)*sa,b+(j-.5)*sb,y0+k*sh),R=P3(a,b,y0+sh/2);
    quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),color,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),color,R);
    quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),color,R);quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),color,R);
    quad(V(0,0,0),V(0,1,0),V(0,1,1),V(0,0,1),color,R);quad(V(1,0,0),V(1,1,0),V(1,1,1),V(1,0,1),color,R);
  };
  const prism=(a,b,y0,y1,r0,r1,n,color)=>{                        // 円すい台（側面だけ）
    const R=P3(a,b,(y0+y1)/2);
    for(let i=0;i<n;i++){const t0=i*6.2832/n,t1=(i+1)*6.2832/n;
      quad(P3(a+Math.cos(t0)*r0,b+Math.sin(t0)*r0,y0),P3(a+Math.cos(t1)*r0,b+Math.sin(t1)*r0,y0),P3(a+Math.cos(t1)*r1,b+Math.sin(t1)*r1,y1),P3(a+Math.cos(t0)*r1,b+Math.sin(t0)*r1,y1),color,R)}
  };
  const cone=(a,b,y0,y1,r0,n,color)=>{const R=P3(a,b,y0),T=P3(a,b,y1);for(let i=0;i<n;i++){const t0=i*6.2832/n,t1=(i+1)*6.2832/n;quad(P3(a+Math.cos(t0)*r0,b+Math.sin(t0)*r0,y0),P3(a+Math.cos(t1)*r0,b+Math.sin(t1)*r0,y0),T,T,color,R)}};
  const walk=(a,b0,b1,wd,top)=>{                                   // 歩ける床（村の橋と同じ当たり判定の四角を並べる）
    const n=Math.max(1,Math.ceil((wd-2.6)/2.4)),st=n>1||wd>2.6?(wd-2.6)/n:0;
    for(let t=b0;t>=b1;t-=1.5)for(let k=0;k<=(wd>2.6?n:0);k++){const q=P3(a+(wd>2.6?-wd/2+1.3+k*st:0),t,0);deck.push({x:q[0],z:q[2],w:2.6,d:2.6,top,m:.1,walk:true})}
  };
  const WOOD=0x8a6a45,BEAM=0x5e4630,POST=0x4a3524,STONE=0x9a968c;
  // 岸壁の縁石（桟橋の所は切れ目）と係船柱
  const piers=[[-70,34+r()*8],[0,40+r()*8],[70,30+r()*8]];
  {let a0=-PA-8;const gaps=piers.map(q=>q[0]).concat([PA+12]).sort((u,v)=>u-v);
    for(const g of gaps){const a1=g-2.4;if(a1-a0>2)box((a0+a1)/2,-4.2,H-2.8,a1-a0,.8,3.1,STONE);a0=g+2.4}
    if(PA+8-a0>2)box((a0+PA+8)/2,-4.2,H-2.8,PA+8-a0,.8,3.1,STONE);
    for(let a=-PA;a<=PA;a+=14)box(a,-2.6,H,.5,.5,.55,POST)}
  // 桟橋
  for(const[a,len]of piers){
    const y=H+.12,b0=-2,b1=-4-len,cb=(b0+b1)/2,sb=b0-b1,wd=3.4;
    box(a,cb,y-.25,wd,sb,.25,WOOD);
    for(const s of[-1,1])box(a+s*wd/2,cb,y-.6,.25,sb,.6,BEAM);
    for(let t=-6;t>=b1;t-=5)for(const s of[-1,1])box(a+s*wd/2,t,WY-4,.38,.38,y+.5-(WY-4),POST);
    for(const s of[-1,1])box(a+s*wd/2,b1+.4,y+.1,.45,.45,.7,POST);
    walk(a,b0,b1,wd,y);
    // 桟橋の付け根の積み荷（木箱と樽）
    for(let i=0;i<3;i++){const ca=a+(i%2?1:-1)*(4+r()*2.5),cbb=-.5+r()*2.2,n=1+Math.floor(r()*3);
      for(let k=0;k<n;k++)box(ca+(r()-.5)*.3,cbb+(r()-.5)*.3,H+k*1.15,1.2,1.2,1.15,[0x9a7a4a,0x84663c,0xa88858][Math.floor(r()*3)]);
      circs.push([P3(ca,cbb,0)[0],P3(ca,cbb,0)[2],1.1])}
    for(let i=0;i<2;i++){const ca=a+(r()<.5?-1:1)*(6.5+r()*2),cbb=.8+r()*1.6;prism(ca,cbb,H,H+1,.45,.4,8,0x6b4a2a);circs.push([P3(ca,cbb,0)[0],P3(ca,cbb,0)[2],.6])}
  }
  // 防波堤と灯台（海のある側の端。どちらも海でなければ、岸壁の端に灯台だけ）
  {const side=[1,-1].find(sd=>{const q=P3(sd*(PA+12),-30,0);return heightAt(q[0],q[2])<WY-.5}),a=(side||1)*(PA+12),top=H+.35;
    let lb=-1;
    if(side){const b0=-3,b1=-58;lb=-52;
      box(a,(b0+b1)/2,WY-3,6.5,b0-b1,top-(WY-3),STONE);
      walk(a,b0,b1,6.5,top);
      for(let b=b0-3;b>b1+6;b-=9)box(a+3.4,b,top,.5,.5,.55,POST),box(a-3.4,b,top,.5,.5,.55,POST)}
    const y0=side?top:H+.25;
    prism(a,lb,y0,y0+4,3.2,2.9,10,0xf0ede4);prism(a,lb,y0+4,y0+8,2.9,2.6,10,0xb83a30);prism(a,lb,y0+8,y0+12,2.6,2.3,10,0xf0ede4);
    box(a,lb,y0+12,5.8,5.8,.35,0x3a3a3f);
    prism(a,lb,y0+12.35,y0+14.6,1.5,1.5,8,0xf3e3a0);cone(a,lb,y0+14.6,y0+16.8,2.1,8,0x8a2f26);
    circs.push([P3(a,lb,0)[0],P3(a,lb,0)[2],3.6]);
  }
  // 船
  const boat=(a,b,ang,len,wid,hull,masts)=>{                        // コグ船（中世ハンザの帆船：ずんぐりした船体・船首尾の櫓・四角い大帆1枚）。masts が空なら帆をたたんで係留
    const q0=P3(a,b,0);if(heightAt(q0[0],q0[2])>WY-.3)return;         // 水に浮かぶ所だけ
    const bA=Math.sin(ang),bB=-Math.cos(ang),sA=Math.cos(ang),sB=Math.sin(ang),Q=(f,s,y)=>P3(a+f*bA+s*sA,b+f*bB+s*sB,y);
    const L=len,Wd=Math.max(wid,L*.3),k=Math.max(.38,L/17),furled=!masts.length;
    const BR=[0x4f3a2a,0x5a3a24,0x6b4a30,0x7a5a38],TIM=BR[(hull&0xff)%4],DARK=0x3b2a1e,SAIL=[0xefe6d0,0xe3d8bb],yt=WY+.45+L*.08,yb=WY-.5,yd=yt-.12;
    const lbox=(f0,f1,s0,s1,y0,y1,c)=>{
      const V=(i,j,m)=>Q(i?f1:f0,j?s1:s0,m?y1:y0),R=Q((f0+f1)/2,(s0+s1)/2,(y0+y1)/2);
      quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),c,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),c,R);
      quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),c,R);quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),c,R);
      quad(V(0,0,0),V(0,1,0),V(0,1,1),V(0,0,1),c,R);quad(V(1,0,0),V(1,1,0),V(1,1,1),V(1,0,1),c,R);
    };
    const rib=(f1,s1,y1,f2,s2,y2,w,c,dir)=>{                         // 索（細い帯。両面）
      const o=dir==='s'?[0,w]:[w,0],pa=Q(f1-o[0],s1-o[1],y1),pb=Q(f1+o[0],s1+o[1],y1),pc=Q(f2+o[0],s2+o[1],y2),pd=Q(f2-o[0],s2-o[1],y2),m=[(f1+f2)/2,(s1+s2)/2,(y1+y2)/2],d=dir==='s'?[0,12]:[12,0];
      quad(pa,pb,pc,pd,c,Q(m[0]+d[0],m[1]+d[1],m[2]));quad(pa,pb,pc,pd,c,Q(m[0]-d[0],m[1]-d[1],m[2]));
    };
    // 船体（ほぼ垂直の舷側・平らな底・つぶれた船首）
    const O=[[-.5,-.4],[-.3,-.5],[.2,-.5],[.42,-.22],[.5,0],[.42,.22],[.2,.5],[-.3,.5],[-.5,.4]];
    const T=O.map(([f,s])=>Q(f*L,s*Wd,yt)),B=O.map(([f,s])=>Q(f*L*.92,s*Wd*.62,yb)),M=O.map(([f,s])=>Q(f*L*.97,s*Wd*.88,yt-(yt-yb)*.55)),ctr=Q(0,0,WY);
    for(let i=0;i<O.length;i++){const j=(i+1)%O.length;quad(T[i],T[j],M[j],M[i],TIM,ctr);quad(M[i],M[j],B[j],B[i],DARK,ctr)}
    for(let i=1;i<O.length-1;i++)quad(Q(O[0][0]*L,O[0][1]*Wd,yd),Q(O[i][0]*L,O[i][1]*Wd,yd),Q(O[i+1][0]*L,O[i+1][1]*Wd,yd),Q(O[i+1][0]*L,O[i+1][1]*Wd,yd),0x8a6a45,Q(0,0,yb));
    // 外板の継ぎ目（舷側に沿う細い帯）
    for(const sg of[-1,1])rib(-.3*L,sg*Wd*.5+sg*.02,yt-(yt-yb)*.3,.2*L,sg*Wd*.5+sg*.02,yt-(yt-yb)*.3,.05,DARK,'f');
    // 舵（船尾に吊る）
    lbox(-L*.5-.4*k,-L*.5+.05,-.14*k,.14*k,yb-.2,yt+.25,DARK);
    // 船尾櫓と船首櫓（胸壁つき）
    const hA=1.1*k+.3,hF=.8*k+.3,m=Math.max(.26,.5*k);
    lbox(-L*.46,-L*.18,-Wd*.4,Wd*.4,yt-.05,yt+hA,TIM);lbox(L*.28,L*.4,-Wd*.2,Wd*.2,yt-.05,yt+hF,TIM);
    const crenel=(f0,f1,s0,s1,y)=>{
      for(let f=f0+m/2;f<=f1-m/2+.01;f+=m*2){lbox(f-m/2,f+m/2,s0,s0+m,y,y+m,DARK);lbox(f-m/2,f+m/2,s1-m,s1,y,y+m,DARK)}
      for(let s=s0+m*2.5;s<=s1-m*2.5+.01;s+=m*2){lbox(f0,f0+m,s-m/2,s+m/2,y,y+m,DARK);lbox(f1-m,f1,s-m/2,s+m/2,y,y+m,DARK)}
    };
    crenel(-L*.46,-L*.18,-Wd*.4,Wd*.4,yt+hA);crenel(L*.28,L*.4,-Wd*.2,Wd*.2,yt+hF);
    // マスト・帆桁・帆
    const mf=L*.04,Hm=L*.82+.6,top=yd+Hm,yy=top-.5*k,sw=L*.52,sh=L*.46,yb2=yy-sh;
    lbox(mf-.1-.01*L,mf+.1+.01*L,-.1-.01*L,.1+.01*L,yd,top,DARK);
    lbox(mf-.45*k,mf+.45*k,-.45*k,.45*k,top-1.5*k,top-1.0*k,TIM);                    // 見張り台
    lbox(mf-.07,mf+.07,-sw/2-.5*k,sw/2+.5*k,yy-.07,yy+.07,DARK);                      // 帆桁
    if(furled)lbox(mf-.22*k,mf+.22*k,-sw/2,sw/2,yy-.5*k,yy-.07,0xcfc3a6);             // たたんだ帆
    else{
      const n=6,bulge=.9*k,fo=t=>bulge*Math.sin(Math.PI*t),RF=Q(mf+25,0,(yy+yb2)/2),RB=Q(mf-25,0,(yy+yb2)/2);
      for(let i=0;i<n;i++){
        const t0=i/n,t1=(i+1)/n,s0=-sw/2+sw*t0,s1=-sw/2+sw*t1,c=SAIL[i%2],
          A=Q(mf+fo(t0),s0,yy-.07),Bq=Q(mf+fo(t1),s1,yy-.07),C=Q(mf+fo(t1)*.8,s1,yb2),D=Q(mf+fo(t0)*.8,s0,yb2);
        quad(A,Bq,C,D,c,RF);quad(A,Bq,C,D,c,RB);
      }
    }
    // 旗と帆柱の索
    rib(mf,0,top,mf,0,top+.9*k,.04,DARK,'s');
    quad(Q(mf,0,top+.9*k),Q(mf-L*.14,0,top+.72*k),Q(mf,0,top+.5*k),Q(mf,0,top+.5*k),0x8a1f1f,Q(mf,12,top+.7*k));
    quad(Q(mf,0,top+.9*k),Q(mf-L*.14,0,top+.72*k),Q(mf,0,top+.5*k),Q(mf,0,top+.5*k),0x8a1f1f,Q(mf,-12,top+.7*k));
    rib(mf,0,top,L*.4,0,yt+hF+m,.04,DARK,'s');rib(mf,0,top,-L*.44,0,yt+hA+m,.04,DARK,'s');
    for(const sg of[-1,1])for(const df of[-.8*k,.8*k])rib(mf,0,top-.6*k,mf+df,sg*Wd*.48,yt,.05,DARK,'f');
  };
  const HULL=[0x8a3f2d,0x3f5f7a,0xd9d2c0,0x4a6a4a,0x7a5a35];
  for(const[a,len]of piers)for(const s of[-1,1]){
    if(r()<.3)continue;
    const bb=-17-r()*Math.max(2,len-24),aa=a+s*(1.7+1.5+r()*.6),L=6+r()*3,Wd=2.4+r()*.8;
    boat(aa,bb,(r()-.5)*.12,L,Wd,HULL[Math.floor(r()*HULL.length)],r()<.5?[[-L*.05,5.5,'t']]:[]);
  }
  for(let i=0;i<3;i++)boat(-95+i*95+(r()-.5)*20,-40-r()*20,(r()-.5)*.5,6.5+r()*2.5,2.6+r()*.6,HULL[Math.floor(r()*HULL.length)],[[-.3,5.8,'t']]);   // 沖に停泊する小舟
  boat(-34,-78,.25,17,5,0x5a3a24,[[-3,12,'s'],[3.5,10,'s']]);                                                                                         // 大きな帆船
  return circs;
}

// ---------- 柵で仕切られた畑 ----------
// 畑 f={cx,cz,ux,uz,hu,hv,kind,seed,gs}: 中心(cx,cz)・長さ方向(ux,uz)・半分の長さhu・半分の幅hv・種類(0=耕した畑 1=野菜の畝 2=麦畑)。
// 向きは v=(-uz,ux)。gs(±1)の側の辺の中央に柵の出入口があり、そこから道(または畑への小道)が入る。場所は高さ(rawH)と川だけで決まる。
const FLD=new Map(),FLDV=new Map(),FRC=128;let FL_U=0,FL_V=0,FENCE_M=null;
function fieldCorners(f){const vx=-f.uz,vz=f.ux,o=[];for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])o.push([f.cx+f.ux*a*f.hu+vx*b*f.hv,f.cz+f.uz*a*f.hu+vz*b*f.hv]);return o}
function fieldRegister(f){
  const R=Math.hypot(f.hu,f.hv)+16,X0=Math.floor((f.cx-R)/FRC),X1=Math.floor((f.cx+R)/FRC),Z0=Math.floor((f.cz-R)/FRC),Z1=Math.floor((f.cz+R)/FRC);
  for(const M of f.pl?[FLD,FLDV]:[FLD])for(let X=X0;X<=X1;X++)for(let Z=Z0;Z<=Z1;Z++){const k=X+','+Z;let L=M.get(k);if(!L){L=[];M.set(k,L)}L.push(f)}
}
function fieldOk(f,spread){                                     // 陸で、川から14m以上離れている所だけ（高低差はspread未満。畑はあとで平らにならすので、都市の畑は大きめに許す）
  if(spread===undefined)spread=7;
  let mn=1e9,mx=-1e9;
  for(const[x,z]of[[f.cx,f.cz],...fieldCorners(f)]){const h=rawH(x,z);mn=Math.min(mn,h);mx=Math.max(mx,h);if(riverEff(x,z)<14)return false}
  return mn>WATER+2.5&&mx-mn<spread;
}
function fieldsOverlap(a,b,m){                                  // 2枚の畑がm以内に近づくか（分離軸）
  const dx=a.cx-b.cx,dz=a.cz-b.cz,ra=Math.hypot(a.hu,a.hv)+m,rb=Math.hypot(b.hu,b.hv);
  if(dx*dx+dz*dz>(ra+rb)*(ra+rb))return false;
  const ca=fieldCorners(a),cb=fieldCorners(b);
  for(const f of[a,b])for(const ax of[[f.ux,f.uz],[-f.uz,f.ux]]){
    let a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    for(const p of ca){const v=p[0]*ax[0]+p[1]*ax[1];if(v<a0)a0=v;if(v>a1)a1=v}
    for(const p of cb){const v=p[0]*ax[0]+p[1]*ax[1];if(v<b0)b0=v;if(v>b1)b1=v}
    if(a1<b0-m||b1<a0-m)return false;
  }
  return true;
}
function farmLane(ox,oz,nx,nz,t0,tMax,W,r,ok,placed,sc,kz){          // 点(ox,oz)から向き(nx,nz)へ土の小道を引き、その両脇に畑を奥へ並べる（畑の出入口は小道に向ける）。okを通った畑だけplacedに足し、小道の長さ(畑が無ければ0)を返す
  const px=-nz,pz=nx;let reach=0;
  for(const sd of[-1,1]){
    for(let t=t0;tMax-t>=22;){
      let len=(28+r()*16)*(sc||1);if(tMax-t-len<22)len=tMax-t;
      const cu=t+len/2,cv=sd*(3+W/2);
      const f={cx:ox+nx*cu+px*cv,cz:oz+nz*cu+pz*cv,ux:nx,uz:nz,hu:len/2,hv:W/2,kind:(kd=>kz>=0?kz:kd)(Math.floor(r()*3)),seed:Math.floor(r()*2),gs:-sd};
      let good=ok(f);
      if(good)for(const g of placed)if(fieldsOverlap(f,g,1.5)){good=false;break}
      if(good){placed.push(f);reach=Math.max(reach,t+len)}
      t+=len+3;
    }
  }
  return reach;
}
function fitPlane(fs){                                          // 村の畑ぜんぶにあてる1枚の平面（最小二乗）。畑はこの面に寄せて平らにする
  const pts=[];for(const f of fs){pts.push([f.cx,f.cz]);for(const c of fieldCorners(f))pts.push(c)}
  let mx=0,mz=0;for(const p of pts){mx+=p[0];mz+=p[1]}mx/=pts.length;mz/=pts.length;
  let sxx=0,sxz=0,szz=0,sxh=0,szh=0,sh=0;
  for(const p of pts){const h=rawH(p[0],p[1]),dx=p[0]-mx,dz=p[1]-mz;sxx+=dx*dx;sxz+=dx*dz;szz+=dz*dz;sxh+=dx*h;szh+=dz*h;sh+=h}
  const det=sxx*szz-sxz*sxz;let b=0,c=0;
  if(det>1e-6){b=(sxh*szz-szh*sxz)/det;c=(szh*sxx-sxh*sxz)/det}
  const cl=v=>Math.max(-.1,Math.min(.1,v));
  return{mx,mz,a:sh/pts.length,b:cl(b),c:cl(c)};
}
function farmFlat(x,z){                                         // 村の畑とそのまわり約12mを平面へ寄せる重みと目標の高さ（なければnull）
  const L=FLDV.get(Math.floor(x/FRC)+','+Math.floor(z/FRC));if(!L)return null;
  let bw=0,bp=null;
  for(const f of L){
    const dx=x-f.cx,dz=z-f.cz,u=Math.abs(dx*f.ux+dz*f.uz)-f.hu,v=Math.abs(-dx*f.uz+dz*f.ux)-f.hv,d=Math.hypot(u>0?u:0,v>0?v:0);
    if(d>=12)continue;let w=d<=1.5?1:1-(d-1.5)/10.5;w=w*w*(3-2*w);if(w>bw){bw=w;bp=f.pl}
  }
  return bp?[bw,bp.a+bp.b*(x-bp.mx)+bp.c*(z-bp.mz)]:null;
}
function fieldAt(x,z,m){                                        // 点(x,z)が畑(からm内側に広げた範囲)の中なら、その畑（FL_U,FL_Vに畑の中の座標）
  ensureRivers(x,z);
  const L=FLD.get(Math.floor(x/FRC)+','+Math.floor(z/FRC));if(!L)return null;
  for(const f of L){
    const dx=x-f.cx,dz=z-f.cz,u=dx*f.ux+dz*f.uz,v=-dx*f.uz+dz*f.ux;
    if(Math.abs(u)<f.hu+m&&Math.abs(v)<f.hv+m){FL_U=u;FL_V=v;return f}
  }
  return null;
}
function buildFences(fields,ox,oy,oz){                          // 木の柵（杭と2段の横木）と当たり判定。座標は(ox,oy,oz)を原点にした値
  const pos=[],nor=[],col=[],circs=[],C=new THREE.Color();
  const quad=(A,B,Cc,D,color,ref)=>{
    const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],w=[Cc[0]-A[0],Cc[1]-A[1],Cc[2]-A[2]];
    let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
    const fc=[(A[0]+B[0]+Cc[0]+D[0])/4-ref[0],(A[1]+B[1]+Cc[1]+D[1])/4-ref[1],(A[2]+B[2]+Cc[2]+D[2])/4-ref[2]];
    let vs=[A,B,Cc,A,Cc,D];
    if(n[0]*fc[0]+n[1]*fc[1]+n[2]*fc[2]<0){vs=[A,Cc,B,A,D,Cc];n=[-n[0],-n[1],-n[2]]}
    const l=Math.hypot(n[0],n[1],n[2])||1;C.setHex(color);
    for(const q of vs){pos.push(q[0]-ox,q[1]-oy,q[2]-oz);nor.push(n[0]/l,n[1]/l,n[2]/l);col.push(C.r,C.g,C.b)}
  };
  const post=(x,y,z,color)=>{                                   // 杭（0.18角・高さ1.15m）
    const s=.09,h=1.15,R=[x,y+h/2,z];
    quad([x-s,y-.3,z-s],[x+s,y-.3,z-s],[x+s,y+h,z-s],[x-s,y+h,z-s],color,R);quad([x-s,y-.3,z+s],[x+s,y-.3,z+s],[x+s,y+h,z+s],[x-s,y+h,z+s],color,R);
    quad([x-s,y-.3,z-s],[x-s,y-.3,z+s],[x-s,y+h,z+s],[x-s,y+h,z-s],color,R);quad([x+s,y-.3,z-s],[x+s,y-.3,z+s],[x+s,y+h,z+s],[x+s,y+h,z-s],color,R);
    quad([x-s,y+h,z-s],[x+s,y+h,z-s],[x+s,y+h,z+s],[x-s,y+h,z+s],color,R);
  };
  const rail=(a,b,dy,color)=>{                                  // 横木（細い帯を縦と横の2枚）
    const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,px=-dz/l*.06,pz=dx/l*.06,y0=dy;
    const A=[a[0],a[1]+y0,a[2]],B=[b[0],b[1]+y0,b[2]],R=[(a[0]+b[0])/2,(a[1]+b[1])/2+y0-3,(a[2]+b[2])/2];
    quad(A,B,[B[0],B[1]+.12,B[2]],[A[0],A[1]+.12,A[2]],color,R);
    quad([A[0]-px,A[1]+.12,A[2]-pz],[B[0]-px,B[1]+.12,B[2]-pz],[B[0]+px,B[1]+.12,B[2]+pz],[A[0]+px,A[1]+.12,A[2]+pz],color,R);
  };
  for(const f of fields){
    const cn=fieldCorners(f);
    for(let e=0;e<4;e++){
      const a=cn[e],b=cn[(e+1)%4],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/3.6)),vsg=e===0?-1:e===2?1:0;   // 辺0=v負側 辺2=v正側（長い辺）
      const isGap=(i0,i1)=>{if(f.both?vsg===0:vsg!==f.gs)return false;const t=((i0+i1)/2)/n,px=a[0]+(b[0]-a[0])*t,pz=a[1]+(b[1]-a[1])*t;return Math.abs((px-f.cx)*f.ux+(pz-f.cz)*f.uz)<(f.gw||2.4)};
      let prev=null;
      for(let i=0;i<=n;i++){
        const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n,y=heightAt(x,z),p=[x,y,z];
        post(x,y,z,0x6b5236);
        if(prev&&!isGap(i-1,i)){rail(prev,p,.45,0x8a6c48);rail(prev,p,.85,0x8a6c48)}
        prev=p;
      }
      for(let s=0;s<len;s+=1.2){const t=s/len;if(isGap(t*n,t*n))continue;const cx=a[0]+(b[0]-a[0])*t,cz=a[1]+(b[1]-a[1])*t,hh=heightAt(cx,cz);circs.push([cx,cz,.35,hh+1.1,hh])}   // 柵: 細い円を密に並べ、高さ(1.1m)つき＝ジャンプで越えられる
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  if(!FENCE_M)FENCE_M=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const m=new THREE.Mesh(g,FENCE_M);m.castShadow=m.receiveShadow=true;m.frustumCulled=false;
  return{mesh:m,geo:g,circs};
}
function fieldColor(f,x,z){                                     // 畑の地面の色（畝のしま模様）。畑のふち1.2mは草のまま
  const u=FL_U,v=FL_V;if(Math.abs(u)>f.hu-1.2||Math.abs(v)>f.hv-1.2)return null;
  const st=(Math.floor(v/2.4)+f.seed)&1,n=(vnoise(x*.4,z*.4)-.5)*.06;
  if(f.kind===3)return null;                                                        // 休閑地（草のまま）
  if(f.kind===0)return st?[.37+n,.27+n,.18+n]:[.29+n,.2+n,.13+n];                 // 耕した土
  if(f.kind===1)return st?[.32+n,.5+n,.2+n]:[.4+n,.3+n,.2+n];                      // 野菜の畝（緑と土）
  return st?[.8+n,.66+n,.3+n]:[.72+n,.58+n,.25+n];                                  // 麦
}
// 傾斜と崖＋段丘: 地形は2種類が場所ごとに入れ替わる（TYPE_MIXで台地の割合）。
//  (1) のこぎり波: ゆるやかな上り坂が続いて、ときどき急に崖で落ちる。
//  (2) 段丘: 崖で急に一段上がる（下がる）と、そのまま平らな台地が広がる。
// どちらも高さに足す波は「向き×距離＋ゆがみ」の小数部。波の平均は0なので、全体の標高は変わらない。
const TILT_L=420,TILT_LOW=5,CLIFF_MIN=6,CLIFF_MAX=38,CLIFF_Q=.008;   // のこぎり波: 波の長さ(m) / 低地の振れ幅(m) / 崖の高さの範囲(m) / 崖で落ちる部分の割合
const TER_L=300,TER_Q=.006,TYPE_MIX=.55;                             // 段丘: 台地の幅(m) / 崖の急さ / 段丘になる場所の割合
let _tlSeed=NaN,_tlC=1,_tlS=0;
function tiltTerrain(x,z,hb){
  if(_tlSeed!==SEED){_tlSeed=SEED;const a=hash(7,13,SEED+4040)*6.2832;_tlC=Math.cos(a);_tlS=Math.sin(a)}   // 向きはマップごとに決まる
  const hw=sm01(4,40,hb);                                          // 高さの重み（低地0 → 高地1）
  const u=vnoise(x*.0013-200,z*.0013+700),Ah=CLIFF_MIN+(CLIFF_MAX-CLIFF_MIN)*Math.pow(sm01(.25,.8,u),2.2);   // 場所ごとの崖の高さ（低い崖が多め）
  const ty=sm01(1-TYPE_MIX-.06,1-TYPE_MIX+.06,vnoise(x*.0009-400,z*.0009+250));   // 0=のこぎり波 / 1=段丘（境目はなめらかに混ぜる）
  const wb=(x*_tlC+z*_tlS),wn=1.6*vnoise(x*.0011+3,z*.0011-8)+.6*vnoise(x*.0043-9,z*.0043+4);
  let h1=0,h2=0;
  if(ty<1){   // (1) のこぎり波
    const cm=sm01(.4,.52,vnoise(x*.0022+500,z*.0022-300))*(.5+.5*hw);
    const A=TILT_LOW+(Ah-TILT_LOW)*cm,q=.5+(CLIFF_Q-.5)*cm,w=wb/TILT_L+wn,f=w-Math.floor(w);
    h1=A*((f<1-q?f/(1-q):(1-f)/q)-.5);
  }
  if(ty>0){   // (2) 段丘
    const cm=sm01(.2,.38,vnoise(x*.0022+500,z*.0022-300))*(.5+.5*hw),A=TILT_LOW*.4+(Ah-TILT_LOW*.4)*cm;
    const w=wb/TER_L+wn,n=Math.floor(w),f=w-n,L=k=>(vnoise(x*.0014+k*13.7,z*.0014-k*7.3)-.5)*2.4;
    const l0=L(n),l1=L(n+1);
    h2=A*(l0+(l1-l0)*sm01(1-TER_Q,1,f))+relief(x,z)*.7;
  }
  return hb+h1*(1-ty)+h2*ty;
}
// 海岸平野: 海の周りだけにできる低い平野。完全には平らでなく、内陸へ向かって小さな崖で段々に上がる（台地状）。海岸線の約60%に出る。
const PLAIN_STEP=4.5,PLAIN_L=240,PLAIN_Q=.012;   // 段の高さ(m) / 1段の幅(m) / 崖の急さ
// 平らな場所のわずかな起伏: ゆるい傾き＋多少のうねり＋ときどき1〜2mの小さな段差。台地の上・盆地の床・氷床・平野に足す（約±4m）。
function relief(x,z){
  const tilt=(vnoise(x*.0025+7,z*.0025-3)-.5)*8,und=(vnoise(x*.012+21,z*.012-14)-.5)*2.5+(vnoise(x*.04-8,z*.04+30)-.5)*.7;
  const w=vnoise(x*.004+50,z*.004-70)*7,n=Math.floor(w),f=w-n,l0=hash(n,3,SEED)*1.6,l1=hash(n+1,3,SEED)*1.6;   // 小さな段差（崖幅は約3m）
  return tilt+und+(l0+(l1-l0)*sm01(.985,1,f))-.8;
}
function plainW(x,z,cd){                                          // 海岸平野の強さ(0〜1)（デバッグのワープ用）
  const dIn=-cd;if(dIn<=0)return 0;
  const pm=sm01(.38,.55,vnoise(x*.00035+77,z*.00035-31)),Dp=1400+1200*vnoise(x*.0006-12,z*.0006+40);
  return pm*(1-sm01(Dp*.75,Dp,dIn));
}
function plainH(x,z,hb,cd){
  const dIn=-cd;if(dIn<=0)return hb;
  const pm=sm01(.38,.55,vnoise(x*.00035+77,z*.00035-31));if(pm<=0)return hb;       // 平野が出る海岸（海岸線に沿って途切れる）
  const Dp=1400+1200*vnoise(x*.0006-12,z*.0006+40),pw=pm*(1-sm01(Dp*.75,Dp,dIn));if(pw<=0)return hb;
  const w=dIn/PLAIN_L+.9*vnoise(x*.002+5,z*.002-9)+.4*vnoise(x*.007-3,z*.007+6),n=Math.floor(w),f=w-n;
  const st=PLAIN_STEP*(.7+.8*vnoise(x*.0015+60,z*.0015-70));
  const p=WATER+7+st*(n+sm01(1-PLAIN_Q,1,f))+2*(vnoise(x*.011+20,z*.011-20)-.5)+relief(x,z)*.6;
  return hb*(1-pw)+p*pw;
}
// 盆地: 内陸に点在する、3面を山と絶壁に囲まれた盆地（残り1面は谷として開く）。床はほぼ平ら。壁は垂直に近い崖→二段目の崖→山の斜面。
function basinOfCell(i,j){
  const key=i+','+j;let b=basinCache.get(key);if(b!==undefined)return b;
  const r=mulberry(hash(i,j,SEED+5151)*1e9|0);
  if(r()>.6){basinCache.set(key,null);return null}
  b={x:(i+.5+(r()-.5)*.28)*BC,z:(j+.5+(r()-.5)*.28)*BC,R:450+r()*320,th:r()*6.2832,Hf:18+r()*16,Hm:90+r()*70,Hc:35+r()*30,H2:12+r()*16,ox:r()*100,oz:r()*100};
  if(contD(b.x,b.z)>-2500)b=null;                                  // 海から遠い内陸だけ
  basinCache.set(key,b);return b;
}
function basinH(x,z,hb){
  const ci=Math.floor(x/BC),cj=Math.floor(z/BC),fx=x/BC-ci,fz=z/BC-cj;
  for(const i of[ci,ci+(fx<.5?-1:1)])for(const j of[cj,cj+(fz<.5?-1:1)]){
    const b=basinOfCell(i,j);if(!b)continue;
    const dx=x-b.x,dz=z-b.z,d2=dx*dx+dz*dz;if(d2>9e6)continue;
    const d=Math.sqrt(d2),Ro=b.R*(1+.3*(vnoise(x*.004+b.ox,z*.004+b.oz)-.5));
    const da=Math.abs(Math.atan2(Math.sin(Math.atan2(dz,dx)-b.th),Math.cos(Math.atan2(dz,dx)-b.th)));
    const ww=sm01(.62,1,da);                                       // 開く側(0)→囲まれた側(1)
    const E=Ro+500+1200*(1-ww),bw=1-sm01(E,E+800,d);if(bw<=0)continue;
    let S=b.Hf+relief(x+b.ox*50,z+b.oz*50);
    const r=d-Ro;
    if(r>0&&ww>0){
      const rid=1-Math.abs(vnoise(x*.0055+b.oz,z*.0055-b.ox)*2-1);
      S+=ww*(b.Hc*sm01(0,7,r)+b.H2*sm01(190,198,r)+(b.Hm-b.Hc-b.H2)*sm01(10,520,r)*(.8+.4*rid));
    }
    hb=hb*(1-bw)+S*bw;
  }
  return hb;
}
// 台地（メサ）: 内陸に点在する、まわり全部が高い絶壁（ほぼ垂直）の平らな台地。上面はほぼ平ら。崖の高さは25m以上（まわりが低いほど高い）。
function mesaOfCell(i,j){
  const key=i+','+j;let m=mesaCache.get(key);if(m!==undefined)return m;
  const r=mulberry(hash(i,j,SEED+6262)*1e9|0);
  if(r()>.5){mesaCache.set(key,null);return null}
  m={x:(i+.5+(r()-.5)*.3)*MC2,z:(j+.5+(r()-.5)*.3)*MC2,R:380+r()*520,Ht:70+r()*55,ox:r()*100,oz:r()*100};
  if(contD(m.x,m.z)>-1800)m=null;                                  // 海から離れた内陸だけ
  mesaCache.set(key,m);return m;
}
function mesaH(x,z,hb){
  const ci=Math.floor(x/MC2),cj=Math.floor(z/MC2),fx=x/MC2-ci,fz=z/MC2-cj;
  for(const i of[ci,ci+(fx<.5?-1:1)])for(const j of[cj,cj+(fz<.5?-1:1)]){
    const m=mesaOfCell(i,j);if(!m)continue;
    const dx=x-m.x,dz=z-m.z,d2=dx*dx+dz*dz;if(d2>2.6e6)continue;
    const d=Math.sqrt(d2),a=Math.atan2(dz,dx);
    const Ro=m.R*(1+.55*(vnoise(x*.004+m.ox,z*.004+m.oz)-.5)+.12*Math.sin(3*a+m.ox)+.08*Math.sin(5*a+m.oz));   // 輪郭: 出入りのある形
    const r=d-Ro;if(r>=8)continue;
    const top=Math.max(m.Ht,hb+25)+relief(x+m.ox*50,z+m.oz*50);   // 上面（ゆるい傾き・うねり・小さな段差を残す）（まわりが高い所でも崖は25m以上）
    const t=sm01(0,8,r);                                           // 内側(0)→崖の外(1)。幅8mでほぼ垂直
    hb=top*(1-t)+hb*t;
  }
  return hb;
}
// 氷のバイオーム: 氷河の平原（なだらかな氷床）・クレバス（細い裂け目）・岩山（氷から突き出る暗い岩）・海岸の青い氷の断崖。
// 重み ic は雪原(tu)の奥にだけあり、縁は雪原→他のバイオームへグラデーションになる。
function iceCrev(x,z){                                            // クレバス（0〜1）。裂け目の帯が出る場所だけ、細い曲線状
  const zm=sm01(.45,.7,vnoise(x*.0012+3,z*.0012-5));if(zm<=0)return 0;
  const l1=1-sm01(0,.035,Math.abs(vnoise(x*.018+40,z*.012-30)-.5)),l2=1-sm01(0,.035,Math.abs(vnoise(x*.011-25,z*.02+60)-.5));
  return zm*Math.max(l1,l2);
}
function iceRockW(x,z){return sm01(.78,.9,vnoise(x*.0032+70,z*.0032-90))}   // 氷から突き出る岩山の強さ(0〜1)
// 砂漠は2タイプ: 平らな砂漠（従来どおり）と、砂丘の海（波のように高低差のある砂漠。うねりの高さ±5〜11m・山から山まで約175m）。砂丘の海は砂漠の約3割の地域に出る。
function duneSeaW(x,z){return sm01(.5,.62,vnoise(x*.0006-300,z*.0006+500))}   // 砂丘の海の地域(0〜1)
function desertDuneH(x,z,hb,de){
  const zn=duneSeaW(x,z)*de;if(zn<=.01)return hb;
  const th=.3+.6*hash(7,7,SEED+5),ct=Math.cos(th),st=Math.sin(th);   // 風向き（シードごとに1つ。向きや波長を場所で変えると遠くで位相が暴れるので固定）
  const u=x*ct+z*st,v=-x*st+z*ct,wp=u+110*(vnoise(x*.004+11,z*.004-23)-.5)+28*Math.sin(v*.012);   // 稜線をゆるく蛇行させる
  const ph=wp/175*6.2832,amp=5+6*vnoise(x*.0025+13,z*.0025-41);
  const w=Math.sin(ph)+.12*Math.sin(2*ph+1)+.12*Math.sin(v/70*6.2832+2*vnoise(x*.005,z*.005));   // 大きなうねり＋風に流された斜めの小さな波紋
  return hb+amp*w*sm01(.15,.5,zn)*sm01(WATER+6,WATER+22,hb);                            // 海辺ではうねりを弱める（水没しない）
}
// 砂漠の渓谷と岩山: 砂漠の中の「岩の地域」(canyonZone)にだけ出る。岩の地域は平らな台地（メサの上面）になり、そこを蛇行する深い渓谷が刻まれる
// （底は幅30mほどの平らな砂地・壁は7段の段々でほぼ垂直。壁は地層の縞）。段々の岩山も立つ。街・隊商宿などの予定地は岩の地域を避ける。
function canyonZone(x,z){return sm01(.6,.74,vnoise(x*.00055+120,z*.00055-60))}   // 岩の地域(0〜1)。広さはおよそ2km
function canyonV(x,z){                                            // 渓谷の筋までの近さ（0=筋の真上）。筋はゆるく蛇行する
  const wx=x+110*(vnoise(x*.0035+5,z*.0035+9)-.5),wz=z+110*(vnoise(x*.0035-14,z*.0035+31)-.5);
  return Math.abs(vnoise(wx*.0016+210,wz*.0016-130)-.5);
}
function canyonWallW(x,z,de){return canyonZone(x,z)*de>.3&&canyonV(x,z)>.008&&canyonV(x,z)<.019?1:0}   // 渓谷の壁（地層の縞の色を付ける）
function canyonFloorW(x,z,de){const zn=canyonZone(x,z)*de;return zn<.3?0:(1-sm01(.006,.012,canyonV(x,z)))*sm01(.3,.6,zn)}   // 渓谷の底（低木を生やす）
function desertRockH(x,z,hb,de){
  const zn=canyonZone(x,z)*de;if(zn<=.01)return hb;
  const zk=sm01(.15,.5,zn),plat=WATER+36+24*vnoise(x*.0007+55,z*.0007-35)+.6*relief(x,z);   // 岩の地域は、まわりが高くても低くても、ほぼ平らな台地になる
  hb+=(plat-hb)*.85*zk;
  const v=canyonV(x,z),depth=48+34*vnoise(x*.002+60,z*.002-90);
  let k=(1-sm01(.008,.017,v))*zk;                                   // 筋の上で1、離れると0（底は幅15mほど・壁の幅は片側6〜8m）
  if(k>0){const kk=k*7,ki=Math.floor(kk);k=(ki+sm01(.55,1,kk-ki))/7;   // 壁を7段の段差にする
    hb+=(Math.max(WATER+3.5,hb-depth)-hb)*k}                        // 海面より下には掘らない（谷が水没しない）
  const bn=vnoise(x*.0042+300,z*.0042-200);
  if(bn>.6){let b=sm01(.6,.67,bn)*sm01(.25,.6,zn);const bb=b*4,bi=Math.floor(bb);b=(bi+sm01(.6,1,bb-bi))/4;   // 岩山: 4段の段差
    hb+=b*(16+22*vnoise(x*.003+77,z*.003-33))+b*(vnoise(x*.03,z*.03)-.5)*3}
  return hb;
}
// オアシス: 砂漠の中に点々とある、小さな池（半径14〜26m）。池のまわりは平らな地面にならされ、ヤシ・広葉樹・アカシアが密に茂り、草色になる。
// 砂漠のほかの場所には植物（木・サボテン）をあまり置かない。1000m四方のセルごとに最大60%（砂漠の濃さ・高さの差などの条件を満たした所だけ）、砂漠の内側（岩の地域・川・陸の端は避ける）にだけできる。池の水は川と同じ水の仕組みで、水面は池の縁より少し下。
function oasisOfCell(i,j){
  const key=i+','+j;if(oasisCache.has(key))return oasisCache.get(key);
  oasisCache.set(key,null);
  const r=mulberry(hash(i,j,SEED+8844)*1e9|0);
  const px=(i+.25+.5*r())*OAC,pz=(j+.25+.5*r())*OAC,Rp=14+12*r(),pr=r();   // 茂みの半径(最大208m)がセルの端(250m)を越えない
  if(pr>.6)return null;
  const Rg=Rp*8,Rf=Rp*4;
  if(climateAt(px,pz).de<.65||canyonZone(px,pz)>.001)return null;
  const Y=rawH(px,pz);if(Y<WATER+10||riverEff(px,pz)<Rg*1.4)return null;
  for(let k=0;k<8;k++){                                           // まわりもすべて砂漠・岩の地域でなく・高さが極端に違わない（池のそばが崖や海にならない）
    const a=k*.785,qx=px+Math.cos(a)*Rg,qz=pz+Math.sin(a)*Rg;
    if(climateAt(qx,qz).de<.45||canyonZone(qx,qz)>.001)return null;
    const qh=rawH(px+Math.cos(a)*Rf*1.3,pz+Math.sin(a)*Rf*1.3);if(qh<WATER+6||Math.abs(qh-Y)>24)return null;
  }
  const S={x:px,z:pz,Rp,Rf,Rg,Y};oasisCache.set(key,S);return S;
}
function oasisCut(x,z,h){                                         // 地面: 池のまわりを平らにならし、中心へすり鉢状に掘る（水面はY-0.7。縁は水面より0.7m高い）
  const S=oasisOfCell(Math.floor(x/OAC),Math.floor(z/OAC));if(!S)return h;
  const d=Math.hypot(x-S.x,z-S.z);if(d>S.Rf)return h;
  h+=(S.Y-h)*(1-sm01(S.Rp*1.5,S.Rf,d));
  const u=d/S.Rp;if(u<1.2)h-=2.8*(1-sm01(.5,1.2,u));
  return h;
}
function oasisAt(x,z){const S=oasisOfCell(Math.floor(x/OAC),Math.floor(z/OAC));return S&&Math.hypot(x-S.x,z-S.z)<S.Rp*1.3?S:null}   // 池（と岸）の中
function oasisNearAt(x,z){const S=oasisOfCell(Math.floor(x/OAC),Math.floor(z/OAC));return S&&Math.hypot(x-S.x,z-S.z)<S.Rg?S:null}   // 茂みの範囲
function oasisW(x,z){const S=oasisOfCell(Math.floor(x/OAC),Math.floor(z/OAC));return S?1-sm01(S.Rp*1.3,S.Rg,Math.hypot(x-S.x,z-S.z)):0}   // オアシスの植物の濃さ(0〜1)
function oasisBlocks(x,z,R){                                      // 街の予定地(半径R)がオアシスに重なるか
  const ci=Math.floor(x/OAC),cj=Math.floor(z/OAC);
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const S=oasisOfCell(ci+a,cj+b);if(S&&Math.hypot(x-S.x,z-S.z)<R+S.Rg)return true}
  return false;
}
function oasisTint(c,S,x,z){                                      // 地面の色: 池のまわりは濡れた砂、その外は草の緑（遠くへ行くほど砂漠の色へ）
  const d=Math.hypot(x-S.x,z-S.z),g=.82*(1-sm01(S.Rp*1.2,S.Rg*.95,d)),w=1-sm01(S.Rp*.9,S.Rp*1.4,d);
  let r=c[0]+(.36-c[0])*g,gg=c[1]+(.5-c[1])*g,b=c[2]+(.2-c[2])*g;
  r+=(.5-r)*w*.8;gg+=(.42-gg)*w*.8;b+=(.3-b)*w*.8;
  return[r,gg,b];
}
function rawH(x,z){                                              // 街の平坦化前の地形。砂漠・ステップ・サバンナは起伏がゆるく広い（砂漠は砂丘）、冷帯はやや山がち
  const c=climateAt(x,z),de=c.de,st=c.st,sv=c.sv,cold=c.C,ic=c.ic;       // CVはすぐ読む（townOfCellからも呼ばれる）
  const big=(fbm(x*0.006,z*0.006)-.5)*70,small=(fbm(x*0.03+50,z*0.03+50)-.5)*8,dune=(vnoise(x*.011+90,z*.019-40)-.5)*6;
  let hb=big*(1-.5*de-.6*st-.25*sv+.25*cold)+small*(1-.6*de-.6*st-.3*sv)+dune*de+mtBump(x,z)+rangeBump(x,z);
  if(hb<WATER+4)hb=WATER+4-(WATER+4-hb)*.1;                      // 内陸の湖・池はほぼ埋める（水は川と海だけ）
  hb=tiltTerrain(x,z,hb);                                        // 平らな所をなくし、ゆるい坂と崖にする
  hb=plainH(x,z,hb,contD(x,z));                                 // 海岸平野（海の周りだけ）
  hb=basinH(x,z,hb);                                             // 3面を山と絶壁に囲まれた盆地
  hb=mesaH(x,z,hb);                                              // まわり全部が絶壁の平らな台地
  if(de>.02)hb=desertDuneH(x,z,hb,de);                          // 砂丘の海（波のような砂漠）
  if(de>.02)hb=desertRockH(x,z,hb,de);                          // 砂漠の峡谷・岩山
  if(ic>.005){                                                  // 氷河: 平らな氷床に均し、クレバスを刻み、岩山を突き出す
    const gl=WATER+16+20*(vnoise(x*.0015+9,z*.0015-4)-.5)+relief(x,z)*.8,k=.7*ic;
    hb=hb*(1-k)+gl*k;
    hb-=ic*iceCrev(x,z)*4;
    const pk=iceRockW(x,z);hb+=ic*pk*pk*(70+40*vnoise(x*.02,z*.02));
  }
  const cdv=contD(x,z),om0=sm01(-250,450,cdv),om=om0+(sm01(-8,8,cdv)-om0)*ic;   // 氷河の海岸はなだらかに沈まず、青い氷の断崖で海へ落ちる   // 海: 大陸の外は深い海、海岸線は約700mかけて沈む
  if(om>0)hb=hb*(1-om)+(WATER-28-12*vnoise(x*.002,z*.002))*om;
  return empBarH(x,z,hb);
}
function makeMarketCity(parent){
  // 王国とは独立した小都市。外壁・水堀・四方の橋と門を備え、内部には橋を置かない。
  const rr=mulberry(hash(Math.round(parent.x),Math.round(parent.z),SEED+8081)*1e9|0);
  const R=235+rr()*65,a0=rr()*Math.PI*2,dist=parent.R>0?parent.R+R+210:0,ctl=[];   // 独立都市(parent.R=0)は調べた場所そのまま
  let x=0,z=0,found=false;
  for(let k=0;k<12&&!found;k++){                                  // 王国のまわり12方向から、予定地がすべて陸の向きを探す（中心は区画の中央）
    const ang=a0+k*Math.PI/6;x=(Math.floor((parent.x+Math.cos(ang)*dist)/L)+.5)*L;z=(Math.floor((parent.z+Math.sin(ang)*dist)/L)+.5)*L;
    if(townLandOk(x,z,R)&&townDesertOk(x,z,R*1.12))found=true;else if(dist===0)break;   // 砂漠の街（王国に付属する市場都市も、独立した砂漠の共和国も）は砂漠の中だけ
  }
  if(!found)return null;
  for(let i=0;i<12;i++)ctl.push(.88+rr()*.24);
  const c={kind:'city',x,z,R,ctl,HS:0,lowP:.12,courtP:.025,landmarks:[],roads:[],bz:[],gates:[],stairs:[],wallB:new Map(),moatB:new Map(),deckB:new Map(),pal:{x,y:0,z,th:0,k:1,rects:[],circs:[],wings:[],roofs:[],dc:[],tb:[],tc:[],arcs:[]}};
  // 4つの屋根付き市場ホールと、広場を囲む小規模な商業施設
  const addHall=(dx,dz,w,d,ht,mi)=>{
    const cols=[];for(let u=-w/2+3;u<w/2;u+=4){cols.push([x+dx+u,z+dz+d/2+1],[x+dx+u,z+dz-d/2-1])}
    c.landmarks.push({type:'b',x:x+dx,z:z+dz,w,d,ht,top:TOWN_H+ht,m:.45,mi,grand:true,dome:false,min:false,uo:0,vo:0,stair:null,bridges:[],ready:true,arcade:true,cols,circs:cols.map(a=>[a[0],a[1],.35]),town:c,roofedMarket:true});
  };
  addHall(-66,-36,52,28,10,0);addHall(66,-36,52,28,10,1);
  addHall(-66,42,52,28,9,2);addHall(66,42,52,28,9,3);
  // 市場通りは広場から四方の門まで伸ばし、門の外の道路・橋へ連続させる。
  c.plaza={x,z,w:74,d:48};
  const reach=R+105,halfW=8;
  c.roads=[
    {ax:'z',c:x,sg:1,a0:z+c.plaza.d/2,a1:z+reach,ang:Math.PI/2},
    {ax:'z',c:x,sg:-1,a0:z-reach,a1:z-c.plaza.d/2,ang:-Math.PI/2},
    {ax:'x',c:z,sg:1,a0:x+c.plaza.w/2,a1:x+reach,ang:0},
    {ax:'x',c:z,sg:-1,a0:x-reach,a1:x-c.plaza.w/2,ang:Math.PI}
  ].filter(q=>townGateOpen(c,q.ang));
  for(const q of c.roads){
    const zr=q.ax==='z',ang=zr?(q.sg>0?Math.PI/2:-Math.PI/2):(q.sg>0?0:Math.PI);
    q.s0=0;q.sf=0;q.s1=townEdge(c,ang)+4;
  }
  // 四方の道路に沿って市場通りを配置。広場の内部は開けたままにする。
  for(const q of c.roads){
    const zr=q.ax==='z',off=(q.sg>0?1:-1)*20,k=Math.round(((zr?z:x)+off)/L);
    c.bz.push({ax:q.ax,k,a0:q.a0,a1:q.a1});
  }
  buildWalls(c);buildDeck(c);buildMoat(c);
  return c;
}
// 小道: 大通り（十字）を境に4つの象限に分け、それぞれ大通りと平行・直角に、4〜6区画(56〜84m)ごとに引く。小道は区画の境目の線上（幅5.6m）。象限ごとに間隔が違う
function ensureLanes(t){
  if(t.lanes)return t.lanes;
  const cl=Math.floor(t.x/L),cz=Math.floor(t.z/L),span=Math.ceil(t.R*1.4/L)+6,rr=mulberry(hash(cl,cz,SEED+313)*1e9|0);
  const gen=(base,sg)=>{const S=new Set([base]);let b=base;while(Math.abs(b-base)<span){b+=sg*(4+Math.floor(rr()*3));S.add(b)}return S};
  const V=[],H=[];
  for(let sx=0;sx<2;sx++)for(let sz=0;sz<2;sz++){const q=sx*2+sz;V[q]=gen(sx?cl+1:cl,sx?1:-1);H[q]=gen(sz?cz+1:cz,sz?1:-1)}   // 大通りの区画(cl,cz)の両側の境目が起点
  return t.lanes={cl,cz,V,H};
}
function blockCenter(t,x,z){                                      // (x,z)を含むブロックの中心。大通りの上・街の外れならnull
  const Ln=ensureLanes(t),lx=Math.floor(x/L),lz=Math.floor(z/L);
  if(lx===Ln.cl||lz===Ln.cz)return null;
  const q=(lx>Ln.cl?2:0)+(lz>Ln.cz?1:0),f=(S,i)=>{let a=i,b=i+1,n=0;while(!S.has(a)&&n<20){a--;n++}n=0;while(!S.has(b)&&n<20){b++;n++}return S.has(a)&&S.has(b)?(a+b)/2*L:null};
  const cx=f(Ln.V[q],lx),cz=f(Ln.H[q],lz);return cx===null||cz===null?null:{x:cx,z:cz};
}
// ---------- 帝国（レア）----------
// 帝国は王都を中心とする連続した都市圏。3×3区画の各区画を諸侯の勢力圏として扱い、内側の境界に城壁を置く。
// 王権の街道は境界城壁の門を通って諸侯領を横断する。建築様式・畑・植生は支配者ではなく、その土地の気候とバイオームに従う。
const EMB=3,EMP_P=.08,EMG=48,empCache=new Map();
const HUT_M=new THREE.MeshLambertMaterial({color:0xffffff}),HUT_B=new THREE.BoxGeometry(1,1,1).translate(0,.5,0),HUT_C=new THREE.ConeGeometry(.7071,1,4).rotateY(Math.PI/4).translate(0,.5,0);
// makeEuro と同じ乱数の並びで、城門の向き・城壁・畑の半径を先に求める（街道を城門の先へつなぐため）。Rj=門の外の道の端
function euroGateInfo(x,z,big,cap){
  const ix=Math.floor(x/ETC),iz=Math.floor(z/ETC),r=mulberry(hash(ix,iz,SEED+4243)*1e9|0),Rt=125+r()*65,ang=[];
  for(let k=0;k<8;k++)ang.push(k*Math.PI/4+(r()-.5)*.2);
  const Rw=Rt+16,Rf=Rw+(big?340:cap?170:130);
  return{ang,Rt,Rw,Rf,Rj:Rf+32,used:new Set()};
}
// 王都から東西南北へ街道を伸ばす。街道は城門から城門へ、道の上に西洋の都市（1〜2つ）が並ぶ。最後の都市の先にも少し道が続く。
function empMainRoads(E,C,r){
  const TWO=Math.PI*2,cx=C.x,cz=C.z,gi0=euroGateInfo(cx,cz,false,true),seats=[{x:cx,z:cz,cap:true,R:.6*TCELL}],euro=[C],lines=[],used=new Set([Math.floor(cx/ETC)+','+Math.floor(cz/ETC)]);
  E.capRo=gi0.Rf+16;                                                  // 王都の外壁の半径
  const inBox=(x,z)=>Math.abs(x-E.ccx)<5050&&Math.abs(z-E.ccz)<5050;
  const probe=a=>{let d=0;for(let s=250;s<=4800;s+=125){const x=cx+Math.cos(a)*s,z=cz+Math.sin(a)*s;if(!inBox(x,z)||rawH(x,z)<=WATER+2.5||climateAt(x,z).de>=.10)break;d=s}return d};   // その向きに、陸が続く距離
  const okCity=(x,z,hmax)=>{
    const h=rawH(x,z);if(h<=WATER+4||h>hmax||mtBump(x,z)>0||rangeBump(x,z)>62)return false;
    if(rough(x,z)>15)return false;                                          // 大都市は山腹でなく、街道・農地を広げられる台地や谷底へ
    const c=climateAt(x,z);if(c.de>=.10||c.M+c.C<.85)return false;
    for(let j=0;j<8;j++){const a=j*.785,q=climateAt(x+Math.cos(a)*250,z+Math.sin(a)*250);if(q.M+q.C<.60||q.de>=.10)return false}
    for(let j=0;j<8;j++){const a=j*.785;if(climateAt(x+Math.cos(a)*700,z+Math.sin(a)*700).de>=.2||rawH(x+Math.cos(a)*500,z+Math.sin(a)*500)<=WATER+2)return false}
    return true};
  const rough=(x,z)=>{let mn=1e9,mx=-1e9;for(let j=0;j<9;j++){const d=j?180:0,a=j*.785,h=rawH(x+Math.cos(a)*d,z+Math.sin(a)*d);if(h<mn)mn=h;if(h>mx)mx=h}return mx-mn}; // 街と街道が置ける広さの平坦地を評価
  const gateTo=(gi,x,z,a)=>{let b=-1,bd=-9;for(let k=0;k<8;k++){if(gi.used.has(k))continue;const d=Math.cos(gi.ang[k]-a);if(d>bd){bd=d;b=k}}gi.used.add(b);return[x+Math.cos(gi.ang[b])*gi.Rj,z+Math.sin(gi.ang[b])*gi.Rj]};
  const base=(r()-.5)*.7;
  for(let k=0;k<4;k++){
    const a0=base+k*Math.PI/2;let ba=a0,D=probe(a0);
    for(const o of[.3,-.3,.6,-.6]){const d2=probe(a0+o);if(d2>D+250){D=d2;ba=a0+o}}
    if(D<2000)continue;                                               // 陸が短い向きには街道を作らない
    const sl=[1750+r()*450];if(D>=4000&&r()<.3)sl.push(sl[0]+1800+r()*350);
    const nodes=[],ux=Math.cos(ba),uz=Math.sin(ba);
    for(let j=0;j<sl.length;j++){
      let best=null,bs=1e9;
      for(let pass=0;pass<2&&!best;pass++){
        const ds=pass?[-450,-300,-150,0,150,300,450]:[-250,-125,0,125,250],os=pass?[-700,-450,-225,0,225,450,700]:[-300,-150,0,150,300];
        for(const dd of ds)for(const o of os){
          const x=cx+ux*(sl[j]+dd)-uz*o,z=cz+uz*(sl[j]+dd)+ux*o;
          if(!inBox(x,z)||!okCity(x,z,pass?40:17))continue;
          const ck=Math.floor(x/ETC)+','+Math.floor(z/ETC);if(used.has(ck))continue;
          if(seats.some(q=>Math.hypot(x-q.x,z-q.z)<1500))continue;
          const sc=rough(x,z)+Math.abs(o)*.01-(coastNear(x,z)?6:0);   // 平らで、できれば海に近い所
          if(sc<bs){bs=sc;best={x,z,ck}}
        }
      }
      if(!best)break;
      used.add(best.ck);const q={t:'e',biome:'e',x:best.x,z:best.z,h:rawH(best.x,best.z)};
      euro.push(q);seats.push({x:q.x,z:q.z,cap:false,R:.46*TCELL});nodes.push(q);
    }
    if(!nodes.length)continue;
    let cur=gateTo(gi0,cx,cz,ba),pts=[[cx,cz],cur],prev={x:cx,z:cz};
    nodes.forEach((nd,j)=>{
      const gi=euroGateInfo(nd.x,nd.z,true),gin=gateTo(gi,nd.x,nd.z,Math.atan2(prev.z-nd.z,prev.x-nd.x));
      const P=empNavPath(cur,gin,k*10+j+1);for(let i=1;i<P.length;i++)pts.push(P[i]);
      pts.push([nd.x,nd.z]);                                          // 都市の中を通り抜ける（市内は城壁の中の道が受け持つ）
      const nx=nodes[j+1],aa=nx?Math.atan2(nx.z-nd.z,nx.x-nd.x):ba;
      cur=gateTo(gi,nd.x,nd.z,aa);pts.push(cur);prev=nd;
    });
    const last=nodes[nodes.length-1],Dt=Math.min(D,(last.x-cx)*ux+(last.z-cz)*uz+1100);   // 最後の都市の先にも道が続く
    if(Dt-((last.x-cx)*ux+(last.z-cz)*uz)>=600){const T=[cx+ux*Dt,cz+uz*Dt],P=empNavPath(cur,T,k*10+9);for(let i=1;i<P.length;i++)pts.push(P[i])}
    lines.push(pts);
  }
  E.seats=seats;E.euro=euro;E.mainLines=lines;E.c0=seats[0];
  E.gates=[];for(let li=0;li<lines.length;li++)empGateLine(E,lines,li);   // 街道が国境の壁を越える所＝要塞の門
  for(const q of euro)if(q.t==='e'){const key=Math.floor(q.x/TCELL)+','+Math.floor(q.z/TCELL),c=E.cells.get(key);if(c&&c.t==='-')E.cells.set(key,q)}
}

// 街道を国境(empD=0)まで延ばし、国境を越える所に要塞の門を決める。門の手前100mから門の先60mまでは、国境の法線方向にまっすぐ通す。
function empGateLine(E,lines,li){
  let pts=lines[li];if(!pts||pts.length<2)return;
  const n0=pts.length,A=pts[n0-1];let k=n0-1;while(k>0&&Math.hypot(pts[k][0]-A[0],pts[k][1]-A[1])<150)k--;
  let dx=A[0]-pts[k][0],dz=A[1]-pts[k][1];const dl=Math.hypot(dx,dz)||1;dx/=dl;dz/=dl;
  const D=p=>empD(E,p[0],p[1]);
  const cross=P=>{for(let i=1;i<P.length;i++)if(D(P[i])>=0&&D(P[i-1])<0)return i;return -1};
  let ci=cross(pts);
  if(ci<0){                                                          // 道が領土の中で終わっている → 国境まで延ばす
    let T=null;
    for(let s=60;s<=4500;s+=60){const x=A[0]+dx*s,z=A[1]+dz*s,h=rawH(x,z);
      if(h<=WATER+2||rangeBump(x,z)>72||mtBump(x,z)>48)return;
      const h2=rawH(x+dx*30,z+dz*30);if(Math.abs(h2-h)/30>.55)return;
      if(D([x,z])>=0){T=[x+dx*50,z+dz*50];break}}
    if(!T||rawH(T[0],T[1])<=WATER+2)return;
    const ext=empNavPath(A,T,li*10+7);pts=pts.concat(ext.slice(1));ci=cross(pts);
  }
  if(ci<0)return;
  let a=pts[ci-1],b=pts[ci],t0=0,t1=1;
  for(let it=0;it<14;it++){const tm=(t0+t1)/2;if(D([a[0]+(b[0]-a[0])*tm,a[1]+(b[1]-a[1])*tm])<0)t0=tm;else t1=tm}
  const G=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
  if(rawH(G[0],G[1])<=WATER+3||rawH(G[0],G[1])>60)return;
  let gx=D([G[0]+3,G[1]])-D([G[0]-3,G[1]]),gz=D([G[0],G[1]+3])-D([G[0],G[1]-3]);const gl=Math.hypot(gx,gz)||1;gx/=gl;gz/=gl;
  let ux=gx,uz=gz;if(!(gl>1e-6)){ux=dx;uz=dz}      // 門は常に国境の法線向きに建てる（門の壁が国境線に沿い、左右の国境の壁とそのままつながる）
  let j=ci-1;while(j>0&&Math.hypot(pts[j][0]-G[0],pts[j][1]-G[1])<100)j--;
  const out=pts.slice(0,j+1),K=out[out.length-1],S0=[G[0]-ux*45,G[1]-uz*45];
  const seg=(P,Q,st)=>{const L=Math.hypot(Q[0]-P[0],Q[1]-P[1]),n=Math.max(1,Math.round(L/st));for(let i=1;i<=n;i++)out.push([P[0]+(Q[0]-P[0])*i/n,P[1]+(Q[1]-P[1])*i/n])};
  seg(K,S0,24);seg(S0,[G[0]+ux*60,G[1]+uz*60],15);
  // 国境門の周囲を短く探索し、道筋を大きく変えずに「少し高く、起伏は小さい」地点へ寄せる。
  // 川の真上・急斜面へ要塞を置かないため、±90mの候補を比較する。
  let gateX=G[0],gateZ=G[1],gateScore=1e9;
  for(let off=-90;off<=90;off+=15){
    const xx=G[0]+ux*off,zz=G[1]+uz*off,hh=rawH(xx,zz);
    if(hh<=WATER+3||hh>75||rangeBump(xx,zz)>95)continue;
    let lo=hh,hi=hh;for(let j=0;j<8;j++){const a=j*Math.PI/4,q=rawH(xx+Math.cos(a)*38,zz+Math.sin(a)*38);lo=Math.min(lo,q);hi=Math.max(hi,q)}
    if(hi-lo>13)continue;
    const score=(75-hh)*.22+(hi-lo)*1.8+Math.abs(off)*.08;
    if(score<gateScore){gateScore=score;gateX=xx;gateZ=zz}
  }
  const gobj={x:gateX,z:gateZ,ux,uz,h:rawH(gateX,gateZ)};
  try{empMargrave(E,out,gobj)}catch(err){console.error(err)}
  lines[li]=out;E.gates.push(gobj);
}
// 門のすぐ内側に、辺境伯領を必ず1つ置く（門をくぐれば街）。街自体の城壁は作らず、要塞の門と国境の壁を街の壁として扱う。
// 畑つきの街が基本。川が近くて畑が取れないときは小さな街（村）にする。地形や他の街との距離では断らない（最低10m）。
function empMargrave(E,out,g){
  const at=d=>{let i=out.length-1;while(i>0&&Math.hypot(out[i][0]-g.x,out[i][1]-g.z)<d)i--;return i};
  const cellFree=(x,z)=>{const ix=Math.floor(x/ETC),iz=Math.floor(z/ETC);return !E.euro.some(o=>Math.abs(Math.floor(o.x/ETC)-ix)<=1&&Math.abs(Math.floor(o.z/ETC)-iz)<=1)};
  const spot=small=>{let i=at(250),gi=euroGateInfo(out[i][0],out[i][1],!small);i=at(76+gi.Rt);gi=euroGateInfo(out[i][0],out[i][1],!small);return{i,small,gi}};   // 家の並ぶ範囲(半径Rt+12)が内門の約20m先から始まる位置
  let pick=null;
  for(const small of[false,true]){const c=spot(small),x=out[c.i][0],z=out[c.i][1];
    if(rawH(x,z)<=WATER+3.5||riverNear(x,z,small?200:350,40)||!cellFree(x,z)||E.seats.some(q=>Math.hypot(x-q.x,z-q.z)<10))continue;
    pick=c;break}
  if(!pick)pick=spot(true);
  const{i,small,gi}=pick,x=out[i][0],z=out[i][1],h=Math.max(rawH(x,z),WATER+3.5);
  const pk=(a,R)=>{let b=0,bd=-9;for(let k=0;k<8;k++){if(gi.used.has(k))continue;const d=Math.cos(gi.ang[k]-a);if(d>bd){bd=d;b=k}}gi.used.add(b);return[x+Math.cos(gi.ang[b])*R,z+Math.sin(gi.ang[b])*R]};
  const back=out[Math.max(0,i-8)],pIn=pk(Math.atan2(back[1]-z,back[0]-x),gi.Rj),pOut=pk(Math.atan2(g.z-z,g.x-x),gi.Rw+10);   // 門側の城門の外から、要塞の内門へ道を通す
  let i0=i;while(i0>0&&Math.hypot(out[i0][0]-x,out[i0][1]-z)<gi.Rj+40)i0--;
  let i1=i;while(i1<out.length-1&&Math.hypot(out[i1][0]-g.x,out[i1][1]-g.z)>70)i1++;
  const nw=out.slice(0,i0+1).concat([pIn,[x,z],pOut],out.slice(i1));out.splice(0,out.length,...nw);
  E.euro.push({t:'e',biome:'e',x,z,h,margrave:true,small,gx:g.x,gz:g.z,gux:g.ux,guz:g.uz});g.margrave=true;
}
function empireOf(bx,bz){
  if(!GEN_OTHER_TOWNS)return null;                               // 生成停止中（帝国がなければ砂漠の街は通常どおり単独で生成される）
  const k=bx+','+bz;if(empCache.has(k))return empCache.get(k);
  empCache.set(k,null);
  const r=mulberry(hash(bx,bz,SEED+9001)*1e9|0);let E=null;
  if(((bx%3)+3)%3===0&&((bz%3)+3)%3===0&&r()<EMP_P){   // 32km級の地域ごとに候補を置き、地形条件を満たす場合も8%だけ帝国化。大半は小国が並ぶ
    const cells=new Map(),euro=[];let land=0;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const ix=bx*EMB+a,iz=bz*EMB+b,isCapital=a===1&&b===1;
      // 集落の種類は候補地のバイオームから決める。砂漠風の街は砂漠に、西洋風の街は温帯・寒帯に限定。
      let s={t:'-'},fb=null;
      for(let n=0;n<18;n++){
        const x=(ix+.18+r()*.64)*TCELL,z=(iz+.18+r()*.64)*TCELL,h=rawH(x,z);
        if(h<=WATER+4)continue;
        const c=climateAt(x,z);
        if(c.de>=.10){continue;   // 砂漠は帝国に含めない
        }else if(c.M+c.C>=.85&&c.de<.10){
          // 西洋風の街は温帯・寒帯の中に置き、街の周囲も同じ気候帯か確認。
          let western=true;for(let j=0;j<8&&western;j++){const q=climateAt(x+Math.cos(j*.785)*250,z+Math.sin(j*.785)*250);if(q.M+q.C<.60||q.de>=.10)western=false}
          if(western){const RR=(isCapital?.6:.46)*TCELL*.9,RW=isCapital?RR:.25*TCELL;   // 諸侯の街は、海まで900mあれば置ける（領土が海岸に届き、港町ができる）。王都は今までどおり周囲が陸
          for(let j=0;j<8&&western;j++){if(climateAt(x+Math.cos(j*.785)*RR,z+Math.sin(j*.785)*RR).de>=.2||rawH(x+Math.cos(j*.785)*RW,z+Math.sin(j*.785)*RW)<=WATER+2)western=false}}
          if(western){
            const relief=[];for(let j=0;j<8;j++)relief.push(rawH(x+Math.cos(j*.785)*210,z+Math.sin(j*.785)*210));
            const spread=Math.max(h,...relief)-Math.min(h,...relief);
            if(spread>17||rangeBump(x,z)>62)continue;                         // 街・農地を展開できない急斜面や山脈の中腹は避ける
            const q=isCapital?{t:'c',biome:'e',x,z,h}:{t:'e',x,z,h};
            if(isCapital){s=q;euro.push(s);break}
            if(coastNear(x,z)){s=q;euro.push(s);break}                       // 海岸近くの都市は港・海上交易に接続
            if(!fb)fb=q
          }
        }
      }
      if(s.t==='-'&&fb){s=fb;euro.push(s)}
      if(s.t!=='-')land++;
      cells.set(ix+','+iz,s);
    }
    const ckey=(bx*EMB+1)+','+(bz*EMB+1),cc=cells.get(ckey);
    if(cc.t==='c'){   // 王都(赤)を中心に、東西南北へ街道を伸ばし、その道の上に西洋の都市を置く（王都以外の拠点は街道の上にだけ作る）
      for(const[k2]of[...cells])if(k2!==ckey)cells.set(k2,{t:'-'});
      E={bx,bz,cells,euro:[cc],roads:null,grid:new Map(),seats:null,ccx:(bx+.5)*EMB*TCELL,ccz:(bz+.5)*EMB*TCELL,c0:null,mainLines:[]};
      empMainRoads(E,cc,r);
    }
  }
  empCache.set(k,E);return E;
}
// 領土: 各拠点を中心にした(円とは限らない)ゆがんだ円の和集合。empD<0 が領土の内側、0が国境、>0が外側（メートル）
function empBaseD(E,x,z){let m=1e9;for(const q of E.seats){const d=Math.hypot(x-q.x,z-q.z)-q.R*(1+.34*(vnoise(x*.0007+q.x*.001,z*.0007+q.z*.001)-.5));if(d<m)m=d}
  return Math.max(m,Math.max(Math.abs(x-E.ccx),Math.abs(z-E.ccz))-5250)}
function empD(E,x,z){
  const base=empBaseD(E,x,z);if(Math.abs(base)>700)return base;
  let best=null,bd=1e9;
  const ci=Math.floor((x+CONT_O)/CONT),cj=Math.floor((z+CONT_O)/CONT);
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const k=contOfCell(ci+a,cj+b);if(!k||Math.hypot(x-k.x,z-k.z)>k.rx*1.25)continue;
    for(const sg of k.sg){const vx=sg[2]-sg[0],vz=sg[3]-sg[1],l2=vx*vx+vz*vz||1,u=Math.max(0,Math.min(1,((x-sg[0])*vx+(z-sg[1])*vz)/l2)),px=sg[0]+vx*u,pz=sg[1]+vz*u,d=Math.hypot(x-px,z-pz);if(d<bd){bd=d;best={x:px,z:pz,tx:vx/Math.sqrt(l2),tz:vz/Math.sqrt(l2)}}}
  }
  // RVHだけを参照し、ここでは川生成を起動しない（境界評価から港生成へ再入するのを防ぐ）。
  const rx=Math.floor(x/RVC),rz=Math.floor(z/RVC);
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=RVH.get((rx+a)+','+(rz+b));if(!arr)continue;
    for(const q of arr){const vx=q.x1-q.x0,vz=q.z1-q.z0,l2=vx*vx+vz*vz||1,u=Math.max(0,Math.min(1,((x-q.x0)*vx+(z-q.z0)*vz)/l2)),px=q.x0+vx*u,pz=q.z0+vz*u,d=Math.hypot(x-px,z-pz);if(d<bd){bd=d;best={x:px,z:pz,tx:vx/Math.sqrt(l2),tz:vz/Math.sqrt(l2)}}}
  }
  if(!best||bd>520)return base;
  const probe=empBaseD(E,best.x,best.z);if(Math.abs(probe)>720)return base;
  const gx=empBaseD(E,x+24,z)-empBaseD(E,x-24,z),gz=empBaseD(E,x,z+24)-empBaseD(E,x,z-24),gl=Math.hypot(gx,gz)||1;
  const align=Math.abs((-gz/gl)*best.tx+(gx/gl)*best.tz);if(align<.58)return base;
  const weight=(1-sm01(280,520,bd))*(1-sm01(240,720,Math.abs(probe)))*Math.min(1,(align-.45)*2.2);
  const nx=-best.tz,nz=best.tx,cross=(x-best.x)*nx+(z-best.z)*nz;
  const plus=empBaseD(E,best.x+nx*24,best.z+nz*24),minus=empBaseD(E,best.x-nx*24,best.z-nz*24);
  const terrainSigned=(plus<minus?-1:1)*cross; // 領土の内側が負になるよう、稜線・河川の左右を決める
  return base*(1-weight*.8)+terrainSigned*(weight*.8);
}
function empBar(x,z){                                              // 国境の外側の自然障壁。高い稜線が国境に重なる場所では、地形を優先して山地の防衛線にする
  const E=empireXZ(x,z);if(!E||!E.seats)return null;const d=empD(E,x,z);if(d<-2||d>420)return null;
  const ridge=rangeBump(x,z),t=(Math.atan2(z-E.c0.z,x-E.c0.x)+Math.PI)/.55,i=Math.floor(t),f=t-i,sf=f*f*(3-2*f),ty=k=>Math.floor(hash(((k%12)+12)%12,E.bx*31+E.bz,SEED+77)*3);
  if(ridge>42)return{d,m:1,r:0,f:0};                                  // 実際の山脈・高い稜線がある場所は、人工的な森や川より山地境界を優先
  const w=[0,0,0];w[ty(i)]+=1-sf;w[ty(i+1)]+=sf;return{d,m:w[0],r:w[1],f:w[2]}}
function empBarH(x,z,h){const b=empBar(x,z);if(!b)return h;const d=b.d;
  if(b.m>0){const k=Math.max(0,Math.min(1,d/50))*(1-Math.max(0,Math.min(1,(d-230)/140)));h+=b.m*k*(70+30*vnoise(x*.01,z*.01))}   // 山: 国境のすぐ外に連なる
  if(b.r>0){const q=Math.max(0,Math.min(1,(Math.abs(d-85)-18)/16)),k=(1-q)*b.r;h=h*(1-k)+(WATER-3.5)*k}                      // 川: 国境の外85mに幅約40mの水路
  return h}
function empForestW(x,z){const b=empBar(x,z);return b&&b.f>0&&b.d>3&&b.d<400?b.f*(1-Math.max(0,(b.d-250)/150)):0}
function empireAt(ix,iz){const E=empireOf(Math.floor(ix/EMB),Math.floor(iz/EMB));return E?{E,s:E.cells.get(ix+','+iz)}:null}
function empireXZ(x,z){return empireOf(Math.floor(x/(EMB*TCELL)),Math.floor(z/(EMB*TCELL)))}
// 帝国の道: 王都から8方向へ街道が伸び、街道から小道が分かれ、道沿いにその土地の建物が建つ。
// 街道は傾斜・水・山を避けて地形に沿う経路を探索（empNavPath）し、小道は等高線に沿って曲がりながら進む。
const EMP_G=48;
function empChaikin(P,n){for(let k=0;k<n;k++){const R=[P[0]];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];R.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}R.push(P[P.length-1]);P=R}return P}
function empNavPath(p,q,sd){                                       // p→q の、地形に沿ったなめらかな折れ線。まず陸だけで探し、だめなら帯を広げ、最後は浅い水を高コストで渡る
  const G=EMP_G,ox=p[0],oz=p[1],dx=q[0]-ox,dz=q[1]-oz,Ld=Math.hypot(dx,dz)||1,ux=dx/Ld,uz=dz/Ld;
  const tI=Math.round(dx/G),tJ=Math.round(dz/G),K=(i,j)=>i*8209+j,dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const info=new Map();
  const nd=(i,j)=>{const k=K(i,j);let o=info.get(k);if(!o){const x=ox+i*G,z=oz+j*G,h=rawH(x,z);let pen=0,wet=false;
    if(h<=WATER+1.6)wet=true;else{const re=riverEff(x,z);if(re<10)pen+=re<2?260:110;const mb=mtBump(x,z);if(mb>0)pen+=18+Math.min(mb*.5,120)}
    o={i,j,x,z,h,wet,pen};info.set(k,o)}return o};
  const search=(Wc,wetPen,maxIter)=>{
    const heap=[],push=(f,i,j)=>{heap.push([f,i,j]);let c=heap.length-1;while(c>0){const pa=(c-1)>>1;if(heap[pa][0]<=heap[c][0])break;[heap[pa],heap[c]]=[heap[c],heap[pa]];c=pa}};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let c=0;for(;;){const l=c*2+1,r=l+1;let m=c;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===c)break;[heap[m],heap[c]]=[heap[c],heap[m]];c=m}}return top};
    const best=new Map();best.set(K(0,0),{i:0,j:0,g:0,pk:null,done:false});push(Math.hypot(dx,dz),0,0);
    let found=null,iter=0;
    while(heap.length&&iter++<maxIter){
      const[,i,j]=pop(),cur=best.get(K(i,j));if(cur.done)continue;cur.done=true;
      if(i===tI&&j===tJ){found=cur;break}
      const a=nd(i,j);
      for(const[di,dj]of dirs){
        const ni=i+di,nj=j+dj,b=nd(ni,nj),rx=b.x-ox,rz=b.z-oz,px=rx*ux+rz*uz,py=-rx*uz+rz*ux;
        if(px<-300||px>Ld+300||Math.abs(py)>Wc)continue;                  // 出発点→目的地の帯の外は探さない
        if(b.wet&&!wetPen&&!(ni===tI&&nj===tJ))continue;                  // 海・湖は通らない（最後の手段だけ渡る）
        const len=(di&&dj?1.414:1)*G,sl=b.wet||a.wet?0:Math.abs(b.h-a.h)/len;
        const c=len*(1+sl*sl*22+(sl>.25?(sl-.25)*60:0)+.12*vnoise(b.x*.007+sd*3.7,b.z*.007))+b.pen+(b.wet?wetPen:0);   // 坂・川・山は高コスト（ゆるいうねりも足す）
        const g=cur.g+c,k=K(ni,nj),old=best.get(k);if(old&&old.g<=g)continue;
        best.set(k,{i:ni,j:nj,g,pk:K(i,j),done:false});push(g+Math.hypot((tI-ni)*G,(tJ-nj)*G),ni,nj);
      }
    }
    if(!found)return null;
    const pts=[];for(let c=found;c;c=c.pk!==null?best.get(c.pk):null)pts.push(nd(c.i,c.j));return pts.reverse();
  };
  const pts=search(Math.max(520,Ld*.2),0,30000)||search(Math.max(1400,Ld*.45),0,60000)||search(Math.max(1400,Ld*.45),400,60000);
  if(!pts||pts.length<2)return[p]; // 経路が見つからない場合は山や海を直線で貫通させず、道を作らない
  const P=pts.map((o,n)=>n===0?[p[0],p[1]]:n===pts.length-1?[q[0],q[1]]:[o.x+(hash(o.i,o.j,SEED+sd)-.5)*G*.5,o.z+(hash(o.j,o.i,SEED+sd+5)-.5)*G*.5]);
  return empChaikin(P,2);
}
function empAlong(P,s,stepFn,cb){                                  // 折れ線Pに沿って、弧長sから間隔stepFnごとにcb(x,z,接線x,接線z,弧長,全長)を呼ぶ
  const cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));
  const Lt=cum[cum.length-1];let idx=1;
  while(s<Lt&&P.length>1){
    while(idx<P.length-1&&cum[idx]<s)idx++;
    const a=P[idx-1],b=P[idx],sl=cum[idx]-cum[idx-1]||1,t=Math.min(1,Math.max(0,(s-cum[idx-1])/sl)),x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
    cb(x,z,(b[0]-a[0])/sl,(b[1]-a[1])/sl,s,Lt);
    s+=Math.max(6,stepFn(x,z));
  }
}
function empRoads(E){                                             // 街道（王都から8方向＋国どうし）・小道・道沿いの家の位置
  if(E.roads)return E.roads;
  E.roads=[];E.lines=E.mainLines.map(P=>({pts:P,br:0}));E.bch=new Map();
  E.cap=[E.c0.x,E.c0.z];
  const TW=E.seats.map(q=>[q.x,q.z]);
  const bx0=E.bx*EMB*TCELL,bz0=E.bz*EMB*TCELL,SPAN=EMB*TCELL;
  const nearBnd=(x,z)=>{if(empD(E,x,z)>-70)return true;return false};   // 諸侯領の境界城壁の手前で止める
  const nearTw=(x,z)=>TW.some(t=>Math.hypot(x-t[0],z-t[1])<300);
  const dcap=(x,z)=>Math.hypot(x-E.cap[0],z-E.cap[1]);
  const nearLine=(x,z,r,skip)=>{for(const ln of E.lines){if(ln===skip)continue;for(const q of ln.pts)if(Math.abs(q[0]-x)<r&&Math.abs(q[1]-z)<r&&Math.hypot(q[0]-x,q[1]-z)<r)return true}return false};
  const rng=mulberry(hash(E.bx,E.bz,SEED+9300)*1e9|0);
  const walk=(x,z,a0,len,depth)=>{                                // 小道: 一歩ごとに「いちばん傾斜が小さい向き」を選んで等高線に沿って進む
    const ln={pts:[[x,z]],br:1},ST=34;let ang=a0,h=rawH(x,z),L=0,n=0;
    while(L<len){
      let bst=null,bc=1e9;
      for(const o of[-.55,-.28,0,.28,.55]){
        const aa=ang+o;if(Math.abs(aa-a0)>1.5)continue;
        const nx=x+Math.cos(aa)*ST,nz=z+Math.sin(aa)*ST,nh=rawH(nx,nz);
        if(nh<=WATER+2||nearBnd(nx,nz)||nearTw(nx,nz)||riverEff(nx,nz)<9)continue;
        const sl=Math.abs(nh-h)/ST;if(sl>.3)continue;
        const c=sl*sl*60+Math.abs(o)*.3+(rng()-.5)*.2+(mtBump(nx,nz)>0?.6:0);
        if(c<bc){bc=c;bst=[nx,nz,nh,aa]}
      }
      if(!bst)break;
      x=bst[0];z=bst[1];h=bst[2];ang=bst[3];L+=ST;n++;ln.pts.push([x,z]);
      if(n>=3&&nearLine(x,z,18,ln))break;                          // 別の道にぶつかったらそこでつなげて終わり
    }
    if(ln.pts.length<4)return;
    ln.pts=empChaikin(ln.pts,1);E.lines.push(ln);
    if(depth<2&&ln.pts.length>=10)for(const f of[.4,.7])if(rng()<(depth?.3:.5)){   // 小道からさらに細い小道が分かれる
      const k=Math.floor(ln.pts.length*f),pp=ln.pts[k],qq=ln.pts[k+1]||pp;
      walk(pp[0],pp[1],Math.atan2(qq[1]-pp[1],qq[0]-pp[0])+(rng()<.5?-1:1)*(1.15+rng()*.4),len*.55,depth+1);
    }
  };
  for(const ln of E.lines.slice()){if(1)break;                    // （細い小道は廃止）街道から小道を分ける（王都に近いほど密、遠いほどまばら）
    empAlong(ln.pts,140+rng()*90,(x,z)=>75+dcap(x,z)*.045+rng()*80,(x,z,tx,tz,s,Lt)=>{
      if(s>Lt-140||nearTw(x,z)||nearBnd(x,z))return;
      const dc=dcap(x,z);
      for(const sd of(dc<1300?[-1,1]:[rng()<.5?-1:1])){
        if(rng()>(dc<1300?.85:.7))continue;
        const len=(120+rng()*240)*(dc<1600?1.3:dc>3600?.7:1);
        walk(x,z,Math.atan2(tz,tx)+sd*Math.PI/2+(rng()-.5)*.6,len,0);   // 街道にほぼ直角に分かれ、そのあとは地形に沿って曲がる
      }
    });
  }
  {const ab=abbeySites(E);let bi=0;                                // 教会領へは、いちばん近い街道（都市の近くを除く）から細い道を分ける。道は教会領の柵の出入口へ着く
    for(const a of ab){
      const cs=Math.cos(a.th),sn=Math.sin(a.th),Wd=(u,v)=>[a.x+u*cs-v*sn,a.z+u*sn+v*cs];
      let bp=null,bd=1e9;
      for(const ln of E.lines){if(ln.br)continue;for(const q of ln.pts){if(E.seats.some(t=>Math.hypot(q[0]-t.x,q[1]-t.z)<700))continue;const d=Math.hypot(q[0]-a.x,q[1]-a.z);if(d<bd){bd=d;bp=q}}}
      if(!bp||bd>2600)continue;
      let gp=null,gd=1e9;for(const[u,v]of[[a.S,0],[-a.S,0],[0,a.S],[0,-a.S]]){const g=Wd(u,v),d=Math.hypot(g[0]-bp[0],g[1]-bp[1]);if(d<gd){gd=d;gp=g}}
      E.lines.push({pts:empNavPath([bp[0],bp[1]],gp,60+bi++),br:1});
    }}
  const addSegs=ln=>{                                             // 道の線分を、距離検索用の格子へ登録
    for(let i=1;i<ln.pts.length;i++){
      const p0=ln.pts[i-1],p1=ln.pts[i],sg=ln.br?[p0[0],p0[1],p1[0],p1[1],1]:[p0[0],p0[1],p1[0],p1[1]];E.roads.push(sg);
      const x0=Math.min(sg[0],sg[2])-8,x1=Math.max(sg[0],sg[2])+8,z0=Math.min(sg[1],sg[3])-8,z1=Math.max(sg[1],sg[3])+8;
      for(let gx=Math.floor(x0/EMG);gx<=Math.floor(x1/EMG);gx++)for(let gz=Math.floor(z0/EMG);gz<=Math.floor(z1/EMG);gz++){const k=gx+','+gz;let g=E.grid.get(k);if(!g)E.grid.set(k,g=[]);g.push(sg)}
    }
  };
  for(const ln of E.lines)addSegs(ln);
  // 道沿いの家の位置: 道の両側に、道の向きにそろえて並べる。王都に近いほど密で背が高い。土地ごとの見た目は生成時（チャンク）に決める。
  E.pil=new Map();                                                 // 列柱: 国境では低く、首都に近づくほど高く（帝国の支配が深まる演出）
  for(const ln of E.lines){if(ln.br)continue;empAlong(ln.pts,10,()=>30,(x,z,tx,tz)=>{
    const dc=dcap(x,z);if(dc>4400||dc<420||empD(E,x,z)>-60||E.seats.some(q=>Math.hypot(x-q.x,z-q.z)<350))return;
    const H=2.6+14*Math.pow(1-dc/4400,1.4);
    for(const sg of[-1,1]){const px=x-tz*sg*9.8,pz=z+tx*sg*9.8,ck=Math.floor(px/CHUNK)+','+Math.floor(pz/CHUNK);let L=E.pil.get(ck);if(!L)E.pil.set(ck,L=[]);L.push([px,pz,H])}})}
  const clr=(x,z)=>{const a=E.grid.get(Math.floor(x/EMG)+','+Math.floor(z/EMG));if(!a)return 1e9;let m=1e9;for(const s of a){const d=segDist(x,z,s);if(d<m)m=d}return m};
  const occ=new Map();
  const placeHouses=(lines,dmin,dmax,rg)=>{                       // 王都からの距離がdmin以上dmax未満の道沿いにだけ家を並べる
    for(const ln of lines){
      const half=ln.ring?3.6:(ln.br?2:11);
      empAlong(ln.pts,rg()*6,(x,z)=>10+rg()*3,(x,z,tx,tz)=>{
        const dc=dcap(x,z);if(dc<dmin||dc>=dmax||empD(E,x,z)>-22)return;
        const pd=.94;
        for(const sd0 of[-1,1,-2,2]){const row=Math.abs(sd0)>1?1:0,sd=sd0>0?1:-1;if(row&&dc>2800)continue;
          if(rg()>pd)continue;
          const w=6.6+rg()*2.9,d=7.5+rg()*2.7,mx=Math.max(w,d)/2,off=mx+half+1+rg()*1.6+row*(d+3);
          const hx=x-tz*sd*off+tx*(rg()-.5)*3,hz=z+tx*sd*off+tz*(rg()-.5)*3;
          const tall=dc<1000?rg()<.8:dc<1800&&rg()<.5,hh=3.6+rg()*1.8+(tall?3.4:0)+Math.max(0,1-dc/2400)*(3+rg()*8),ry=Math.atan2(-tz,tx)+(sd===1?Math.PI:0)+(rg()-.5)*.1,tn=rg(),rh=2.2+rg()*1.1;
          if(clr(hx,hz)<mx+2.2)continue;                           // 別の道（交差点）にかぶる所には建てない
          const ox=Math.floor(hx/16),oz=Math.floor(hz/16);let hit=false;
          for(let i=-1;i<=1&&!hit;i++)for(let j=-1;j<=1&&!hit;j++){const L2=occ.get((ox+i)+','+(oz+j));if(L2)for(const o of L2)if(Math.hypot(hx-o[0],hz-o[1])<(mx+o[2])*1.05){hit=true;break}}
          if(hit)continue;
          const ok=ox+','+oz;let L3=occ.get(ok);if(!L3)occ.set(ok,L3=[]);L3.push([hx,hz,mx]);
          const ck=Math.floor(hx/CHUNK)+','+Math.floor(hz/CHUNK);let L4=E.bch.get(ck);if(!L4)E.bch.set(ck,L4=[]);
          L4.push([hx,hz,w,d,hh,ry,tn,rh,tall?1:0]);
        }
      });
    }
  };
  // （城壁の外の道沿いには家を建てない）
  // 王都の市街（半径1km）: プレイヤーが王都に近づいたとき（empDistrict）に初めて作る。街壁・畑の外から1kmまで、同心円状の通りを60mおきに通し、道沿いに家をぎっしり並べる。
  E.district=()=>{
    placeHouses(E.lines,0,E.capRo-14,mulberry(hash(E.bx,E.bz,SEED+9400)*1e9|0));   // 王都の外壁の内側の道沿いだけ
  };
  return E.roads;
}
function empDistrict(E,x,z){                                       // 王都の1.15km以内に入ったら、市街を一度だけ作る
  if(E.dist)return;empRoads(E);
  if(Math.hypot(x-E.cap[0],z-E.cap[1])<1100){E.dist=1;E.district()}
}
function empTownQ(x,z){let q=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z,v=Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx));if(v<q)q=v}return q}   // 砂漠の街の外壁の外側までの距離（中なら負）
function empCapCut(x,z,u){                                          // 王都から700m以内は木を切り開き、700〜1000mはまばらに残す
  const E=empireXZ(x,z);if(!E)return false;if(!E.cap)empRoads(E);
  const d=Math.hypot(x-E.cap[0],z-E.cap[1]),Ro=E.capRo||380;return d<Ro+60&&u>.12+.88*Math.min(1,Math.max(0,(d-Ro)/60));   // 王都の外壁の中だけ切り開く（壁の外は森のまま）
     // 首都の市街は木を少しだけ残す（家の隙間に点在）
}
function empRoadD(x,z){                                           // 帝国の道の中心線までの距離（小道は細いので少し遠く見積もる。帝国の外・道が遠ければ大きな値）
  const E=empireXZ(x,z);if(!E)return 1e9;empDistrict(E,x,z);
  const a=E.grid.get(Math.floor(x/EMG)+','+Math.floor(z/EMG));if(!a)return 1e9;
  let m=1e9;for(const s of a){const d=segDist(x,z,s)+(s[4]?1.6:-3.5);if(d<m)m=d}return m;
}
function empCapR(E,x,z){const a=Math.atan2(z-E.cap[1],x-E.cap[0]);return 600+(vnoise(Math.cos(a)*3+7,Math.sin(a)*3)-.5)*60}   // 首都の外城壁の半径
function empFortress(g){                                          // 国境の要塞。u=国境の外向き(道の向き)、v=国境に沿う向き。道は v=0。外門(u=0=国境線)と内門(u=-44)が道をまたぎ、四隅に円塔、側壁の途中に角塔。外門の左右へ国境の壁がつながる
  if(g.parts)return g.parts;
  const ux=g.ux,uz=g.uz,vx=-uz,vz=ux,ry=Math.atan2(-uz,ux),W=(u,v)=>[g.x+ux*u+vx*v,g.z+uz*u+vz*v],boxes=[],roofs=[],deco=[];
  const cv=climateAt(g.x,g.z),des=cv.de>=.6,cw=new THREE.Color(des?0xc2a572:0xbdb6a3),ct=new THREE.Color(des?0xb39565:0xa8a291),ck=new THREE.Color(des?0xb39565:0xafa898),cr=new THREE.Color(des?0x9a5b3a:0x4b5560);
  const dk=new THREE.Color(0x2a2a2c),red=new THREE.Color(0x8e1f1f);
  let HB=-1e9;for(let u=-50;u<=8;u+=6)for(let v=-36;v<=36;v+=6){const q=W(u,v);HB=Math.max(HB,heightAt(q[0],q[1]))}g.HB=HB;   // 要塞の敷地でいちばん高い地面。壁・塔・門楼の上端はすべてこの高さにそろえ、下だけを地面まで伸ばす
  const dbox=(u,v,wu,wv,y0,hh,col)=>{const c=W(u,v);deco.push([c[0],y0,c[1],wu,hh,wv,ry,col])};   // 当たり判定の無い飾り
  const HS=(u,v,s)=>{const o=[];for(const[a,b]of[[0,0],[1,1],[1,-1],[-1,1],[-1,-1]]){const q=W(u+a*s/2,v+b*s/2);o.push(heightAt(q[0],q[1]))}return o};
  const wall=(u,v,wu,wv,hh)=>{const c=W(u,v),hs=HS(u,v,Math.max(wu,wv)),lo=Math.min(...hs)-2.5,top=HB+hh;boxes.push([c[0],(lo+top)/2,c[1],wu,top-lo,wv,ry,cw]);
    const al=wu>wv;for(const o of[-1.6,1.6])dbox(al?u+o:u,al?v:v+o,al?2:wu,al?wv:2,top-.4,1.6,cw)};   // 壁+胸壁
  const block=(u,v,wu,wv,hh,col)=>{const c=W(u,v),hs=HS(u,v,Math.max(wu,wv)),lo=Math.min(...hs)-3,top=HB+hh;boxes.push([c[0],(lo+top)/2,c[1],wu,top-lo,wv,ry,col]);return top};
  const tower=(u,v,r,hh,roofH)=>{const c=W(u,v),hs=HS(u,v,2*r),lo=Math.min(...hs)-3,top=HB+hh;   // 円塔=正八角形(4本の長方形を45°ずつ回して重ねる)
    for(let k=0;k<4;k++)boxes.push([c[0],(lo+top)/2,c[1],2*r*.924,top-lo,2*r*.383,ry+k*Math.PI/4,ct]);
    if(roofH)roofs.push([c[0],top,c[1],2*r*1.25,roofH,2*r*1.25,ry,cr]);
    else for(let k=0;k<12;k++){const a=k*Math.PI/6;dbox(u+Math.cos(a)*r*.85,v+Math.sin(a)*r*.85,1.5,1.5,top-.2,1.5,ct)}};   // 円塔の胸壁
  const gatehouse=u0=>{const gh=HS(u0,0,1)[0];                      // 門楼: 道の両脇に塔の塊、その上にアーチの壁。道の外向きの面に落とし格子と赤い旗
    let T=0;for(const sv of[-1,1])for(const du of[-3.25,3.25])T=Math.max(T,block(u0+du,sv*9,6.5,9,22,ct));
    dbox(u0,0,13,9.6,gh+10,T-gh-10,ct);
    for(let v=-13.2;v<=13.3;v+=2.64)for(const fu of[-6.2,6.2])dbox(u0+fu,v,1.6,1.6,T-.2,1.6,ct);   // 門楼の胸壁
    for(let u=-3.1;u<=3.2;u+=3.1)for(const fv of[-13.2,13.2])dbox(u0+u,fv,1.6,1.6,T-.2,1.6,ct);                                    // アーチの上の壁
    for(let y=5;y<10;y+=.8){const w=Math.sqrt(Math.max(0,20.25-(y+.4-5)**2)),sw=4.8-w;if(sw>.05)for(const sv of[-1,1])dbox(u0,sv*(w+sw/2),13,sw,gh+y,.8,ct)}   // 半円のアーチ（階段状に積む。開口は幅9・高さ約9.5）
    const pu=u0-5.4;for(let v=-4.5;v<=4.51;v+=1.125)dbox(pu,v,.35,.35,gh+3.4,5+Math.sqrt(Math.max(0,20.25-v*v))-3.4+.3,dk);   // 縦の格子: 上端をアーチの曲線まで伸ばして隙間を埋める
    for(const[y,w]of[[3.6,9.2],[5.2,9.2],[6.6,9.2],[8,6.8],[9,4.2]])dbox(pu,0,.35,w,gh+y,.35,dk);
    for(const sv of[-1,1])dbox(u0+6.8,sv*9,.25,2.6,gh+14,7,red);
    const gold=new THREE.Color(0xd9b24a);                              // 正面（アーチの上の壁）に垂らす大きな旗を左右に1枚ずつ
    for(const sv of[-1,1]){dbox(u0+6.8,sv*2.7,.25,3.2,T-10.5,9.5,red);dbox(u0+6.9,sv*2.7,.3,3.4,T-10.5,.5,gold);dbox(u0+6.9,sv*2.7,.3,1.3,T-6.5,1.3,gold)}};
  const UO=0,UI=-44,VC=31;
  gatehouse(UO);gatehouse(UI);
  for(const u of[UO,UI])for(const sv of[-1,1]){for(let v=16.2;v<27;v+=5)wall(u,sv*v,4,5.8,12);tower(u,sv*VC,5.5,20,0)}   // 門と四隅の円塔のあいだの壁
  for(const sv of[-1,1]){for(let u=-6.5;u>-38;u-=5)wall(u,sv*VC,5.8,3,12);for(const u of[UI/3,UI*2/3]){const t=block(u,sv*VC,7,7,18,ct);for(const[a,b]of[[-3,-3],[-3,0],[-3,3],[0,-3],[0,3],[3,-3],[3,0],[3,3]])dbox(u+a,sv*VC+b,1.6,1.6,t-.2,1.6,ct)}}   // 側壁と、途中の四角い塔
  const by=new Map();for(const a of boxes.concat(roofs,deco)){const key=Math.floor(a[0]/CHUNK)+','+Math.floor(a[2]/CHUNK);let L=by.get(key);if(!L)by.set(key,L=[]);L.push(a)}
  g.parts={boxes,roofs,deco,by,roofSet:new Set(roofs),decoSet:new Set(deco)};return g.parts;
}
function empFortressDeco(cx,cz,E){                                 // このチャンクにある要塞の飾り（当たり判定なし）
  const out=[];if(!E.gates)return out;
  for(const g of E.gates){if(Math.hypot(g.x-(cx+.5)*CHUNK,g.z-(cz+.5)*CHUNK)>120)continue;const P=empFortress(g);for(const a of(P.by.get(cx+','+cz)||[]))if(P.decoSet.has(a))out.push(a)}
  return out;
}
function empFortressRoofs(cx,cz,E){                                // このチャンクにある要塞の屋根（円錐形の屋根は家の屋根と同じ描画）
  const out=[];if(!E.gates)return out;
  for(const g of E.gates){if(Math.hypot(g.x-(cx+.5)*CHUNK,g.z-(cz+.5)*CHUNK)>120)continue;const P=empFortress(g);for(const a of(P.by.get(cx+','+cz)||[]))if(P.roofSet.has(a))out.push(a)}
  return out;
}
function empireBoundaryWalls(cx,cz,E){                           // 国境の城壁。国境線(empD=0)に沿って並べ、街道が通る所には要塞を建てる
  const out=[],x0=cx*CHUNK,z0=cz*CHUNK,x1=x0+CHUNK,z1=z0+CHUNK,step=6,thick=4,wh=10;
  if(!E.seats)return out;empRoads(E);
  for(const g of(E.gates||[])){if(Math.hypot(g.x-(cx+.5)*CHUNK,g.z-(cz+.5)*CHUNK)>120)continue;const P=empFortress(g);for(const a of(P.by.get(cx+','+cz)||[]))if(!P.roofSet.has(a)&&!P.decoSet.has(a))out.push(a)}   // 要塞の壁・塔
  const gates=E.gates||[],inGate=(px,pz)=>gates.some(g=>{const dx=px-g.x,dz=pz-g.z,u=dx*g.ux+dz*g.uz,v=-dx*g.uz+dz*g.ux;return u>-52&&u<10&&Math.abs(v)<33.5});
  if(Math.abs(empD(E,x0+CHUNK/2,z0+CHUNK/2))<CHUNK)for(let x=Math.floor(x0/step)*step;x<x1;x+=step)for(let z=Math.floor(z0/step)*step;z<z1;z+=step){
    let px=x+step/2,pz=z+step/2,d=empD(E,px,pz);if(Math.abs(d)>step*.6)continue;
    let gx=0,gz=0,gl=1;
    for(let it=0;it<3;it++){gx=empD(E,px+3,pz)-empD(E,px-3,pz);gz=empD(E,px,pz+3)-empD(E,px,pz-3);gl=Math.hypot(gx,gz)||1;d=empD(E,px,pz);px-=d*gx/gl;pz-=d*gz/gl}   // 輪郭線の上へ寄せる（ガタつき防止）
    if(px<x0||px>=x1||pz<z0||pz>=z1||inGate(px,pz))continue;
    const tx=-gz/gl,tz=gx/gl;
    const rd=empRoadD(px,pz);if(rd<17){if(rd>10&&Math.abs(d)<step*.55){const ht=heightAt(px,pz);if(ht>WATER+1.5)out.push([px,ht+10,pz,8,22,8,0,new THREE.Color(0xc9b98f)])}continue}
    const h0=heightAt(px,pz);if(h0<WATER+1.5||h0>60)continue;
    const cv=climateAt(px,pz),des=cv.de>=.6;
    {let gT=null,gd=1e9;for(const g of gates){const dd=Math.hypot(px-g.x,pz-g.z);if(dd<gd){gd=dd;gT=g}}   // 門に近い壁は上端を門の壁の高さにそろえ、下だけ地面まで伸ばす（遠ざかるにつれ地形になじませる）
      const hA=heightAt(px-tx*9,pz-tz*9),hB=heightAt(px+tx*9,pz+tz*9),hM=Math.max(h0,hA,hB),lo=Math.min(h0,hA,hB)-3.4;let top=hM+wh-.4;
      if(gT&&gd<160){empFortress(gT);const t=Math.max(0,Math.min(1,(gd-40)/120));top=Math.max((gT.HB+12)*(1-t)+top*t,hM+3)}
      out.push([px,(lo+top)/2,pz,step*1.9,top-lo,thick,Math.atan2(-tz,tx),new THREE.Color(des?0xb99a6a:(cv.C>.45?0x888d8b:0xb5b0a3))])}
  }
  for(let x=Math.floor(x0/step)*step;x<x1;x+=step)for(let z=Math.floor(z0/step)*step;z<z1;z+=step){   // 首都の外城壁
    let px=x+step/2,pz=z+step/2;const dc=Math.hypot(px-E.cap[0],pz-E.cap[1]);continue;   // 首都の外城壁(600m)は廃止
    if(dc<480||dc>760)continue;
    const d=dc-empCapR(E,px,pz);if(Math.abs(d)>step*.55||empD(E,px,pz)>-10)continue;
    const rx=(px-E.cap[0])/dc,rz=(pz-E.cap[1])/dc,Rr=empCapR(E,px,pz);px=E.cap[0]+rx*Rr;pz=E.cap[1]+rz*Rr;   // 円周上へ寄せる
    const rd=empRoadD(px,pz),ht=heightAt(px,pz);if(ht<WATER+1.5||ht>60)continue;
    const col=new THREE.Color(climateAt(px,pz).C>.45?0x9a9d9a:0xc4b99a);
    if(rd<17){if(rd>10)out.push([px,ht+12,pz,9,26,9,0,col]);continue}
    out.push([px,ht+5.5,pz,step*1.9,11,3.6,Math.atan2(-rx,-rz),col]);
    if(((Math.floor(px/step)*7+Math.floor(pz/step)*13)%11+11)%11===0)out.push([px,ht+8,pz,8,17,8,0,col]);   // 見張り塔
  }
  return out;
}
function townLandOk(x,z,R){                                      // 街の予定地が陸か（中心と、半径の.5・.85・1.1倍の16方向がすべて海面より十分上）。海や湖の上に街を作らない
  if(rawH(x,z)<WATER+3)return false;
  for(const f of[.5,.85,1.1])for(let i=0;i<16;i++){const a=i*Math.PI/8;if(rawH(x+Math.cos(a)*R*f,z+Math.sin(a)*R*f)<WATER+3)return false}
  return true;
}
function townDesertOk(x,z,Rmax){                                 // 街の予定地がすべて砂漠か（中心と、最大半径の.5・.85・1.0倍の16方向。外周は外壁の外の平らな帯ぶん70m外まで）。砂漠でない所に街を作って、そこだけ砂漠のように見えるのを防ぐ（オアシスの上にも作らない）
  if(oasisBlocks(x,z,Rmax*1.1+70)||riverNear(x,z,Rmax*1.1+70,30))return false;   // オアシス・川の上には街を作らない
  if(climateAt(x,z).de<.6||canyonZone(x,z)>.001)return false;
  for(const f of[.5,.85,1])for(let i=0;i<16;i++){const a=i*Math.PI/8,d=Rmax*f+(f>.9?70:0),qx=x+Math.cos(a)*d,qz=z+Math.sin(a)*d;if(climateAt(qx,qz).de<.6||canyonZone(qx,qz)>.001)return false}
  return true;
}
function townOfCell(ix,iz){
  const k=ix+','+iz;if(townCache.has(k))return townCache.get(k);
  const r=mulberry(hash(ix,iz,SEED+101)*1e9|0),EC=empireAt(ix,iz),desertEmpire=!!EC&&(EC.s.t==='d'||(EC.s.t==='c'&&EC.s.biome==='d')),forced=desertEmpire;   // 帝国の砂漠風拠点だけを砂漠に生成。西洋風拠点は euroOfCell 側で生成
  let t=null;
  if(EC&&!forced){townCache.set(k,null);return null}
  if(forced||r()<TOWN_P){
    const R=EC?(EC.s.t==='c'?340+r()*110:140+r()*100):260+r()*160,ctl=[];   // 重いので街の規模を小さめに
    let x=0,z=0,bs=1e9;
    for(let n=0;n<14;n++){                                      // 候補地を14か所ためして、砂漠の中で海が少なく平らな所を選ぶ（砂漠以外にはかからない所だけ）
      const cx=(ix+.35+r()*.3)*TCELL,cz=(iz+.35+r()*.3)*TCELL;
      let dm=climateAt(cx,cz).de;                               // 中心と、街の外周（半径の1.15倍）8方向がすべて砂漠か
      for(let i=0;i<8&&dm>=.6;i++)dm=Math.min(dm,climateAt(cx+Math.cos(i*.785)*R*1.15,cz+Math.sin(i*.785)*R*1.15).de);
      if(dm<.6)continue;
      if(!townLandOk(cx,cz,R))continue;                         // 海・湖にかかる候補地は選ばない
      if(!townDesertOk(cx,cz,R*1.23))continue;                  // 街の輪郭の最大(1.23倍)までがすべて砂漠の所だけ
      let wet=0,mn=1e9,mx=-1e9;
      for(let i=0;i<9;i++){
        const a=i*.785,d=i?R*.7:0,h=rawH(cx+Math.cos(a)*d,cz+Math.sin(a)*d);
        if(h<WATER+2)wet++;if(h<mn)mn=h;if(h>mx)mx=h;
      }
      const s=wet*100+(mx-mn);
      if(s<bs){bs=s;x=cx;z=cz}
    }
    if(bs>=1e9){townCache.set(k,null);return null}              // この区画に砂漠の候補地が無ければ、街は作らない
    x=(Math.floor(x/L)+.5)*L;z=(Math.floor(z/L)+.5)*L;          // 街の中心を区画の中央にそろえる（大通りが区画の真ん中を通り、小道の格子とぴったり合う）
    for(let i=0;i<12;i++)ctl.push(.78+r()*.45);                 // 輪郭のでこぼこ（方位ごとの半径倍率）
    const districtStyle=r();
    t={x,z,R,ctl,lowP:.08+r()*.42,courtP:.10+r()*.20,openP:.06+r()*.09,style:districtStyle,landmarks:[]};
    const HS=Math.round(.22*R),fv=[[0,1],[1,0],[-1,0],[0,-1]][Math.floor(r()*4)];   // HS=宮殿の城壁(四角)の半分の長さ。宮殿の正面は東西南北のどれか
    t.HS=HS;t.pal=makePalace(t,fv[0],fv[1],HS/85);
    const L2=1.5*R;                                             // 主要な道: 宮殿の城壁の門から東西南北へ（街の外まで）
    const roadCandidates=[
      {ax:'z',c:x,a0:z+HS,a1:z+L2,ang:Math.PI/2},{ax:'z',c:x,a0:z-L2,a1:z-HS,ang:-Math.PI/2},
      {ax:'x',c:z,a0:x+HS,a1:x+L2,ang:0},{ax:'x',c:z,a0:x-L2,a1:x-HS,ang:Math.PI}
    ];
    t.roads=roadCandidates.filter(q=>townGateOpen(t,q.ang));
    for(const q of t.roads){const zr=q.ax==='z',sg=q.a0>(zr?z:x)?1:-1;q.sg=sg;q.s0=HS-1.5;q.sf=HS+1.5;q.s1=townEdge(t,zr?sg*Math.PI/2:(sg>0?0:Math.PI))+4}
    buildWalls(t);buildDeck(t);buildMoat(t);
    const n=2+Math.floor(R/110);                                 // 大モスク/マドラサ風の大建築（内壁と外壁のあいだの地区に散らす。道とは重ならない）
    for(let i=0;i<n;i++){
      const a=r()*Math.PI*2,e=townEdge(t,a),ri=e*INNER_K,rad=ri+35+r()*Math.max(10,e-ri-90),w=20+r()*8,d=16+r()*6,ht=14+Math.floor(r()*4)*2;
      let lx=x+Math.cos(a)*rad,lz=z+Math.sin(a)*rad;const bc=blockCenter(t,lx,lz);if(!bc)continue;lx=bc.x;lz=bc.z;   // ブロックの中心に
      if(roadClip(t,lx,lz,Math.max(w,d)/2+3,Math.max(w,d)/2+3,true)||t.landmarks.some(m=>Math.abs(lx-m.x)<(w+m.w)/2+4&&Math.abs(lz-m.z)<(d+m.d)/2+4))continue;
      const cols=[];for(let u=1.6;u<w/2-1;u+=3.2)cols.push([lx-u,lz+d/2+3],[lx+u,lz+d/2+3]);
      t.landmarks.push({type:'b',x:lx,z:lz,w,d,ht,top:TOWN_H+ht,m:.45,mi:Math.floor(r()*5),grand:true,dome:true,min:true,uo:0,vo:0,stair:null,bridges:[],ready:true,arcade:true,cols,circs:cols.map(c=>[c[0],c[1],.35])});
    }
    for(let i=0,n2=1+Math.floor(R/200);i<n2;i++){                // 内壁の内側（宮殿と内壁のあいだ）にも大建築を置いて空き地を埋める
      const a=r()*Math.PI*2,ri=townEdge(t,a)*INNER_K,lo=HS*1.45+25,hi=ri-30;if(hi<=lo)continue;
      const rad=lo+r()*(hi-lo),w=20+r()*8,d=16+r()*6,ht=14+Math.floor(r()*4)*2;let lx=x+Math.cos(a)*rad,lz=z+Math.sin(a)*rad;const bc=blockCenter(t,lx,lz);if(!bc)continue;lx=bc.x;lz=bc.z;
      if(roadClip(t,lx,lz,Math.max(w,d)/2+3,Math.max(w,d)/2+3,true)||t.landmarks.some(m=>Math.abs(lx-m.x)<(w+m.w)/2+4&&Math.abs(lz-m.z)<(d+m.d)/2+4))continue;
      const cols=[];for(let u=1.6;u<w/2-1;u+=3.2)cols.push([lx-u,lz+d/2+3],[lx+u,lz+d/2+3]);
      t.landmarks.push({type:'b',x:lx,z:lz,w,d,ht,top:TOWN_H+ht,m:.45,mi:Math.floor(r()*5),grand:true,dome:true,min:true,uo:0,vo:0,stair:null,bridges:[],ready:true,arcade:true,cols,circs:cols.map(c=>[c[0],c[1],.35])});
    }
  }
  if(t){                                                      // 商店街: 幅6mの通り（格子線上）の両側に店が並ぶ。入り口の内側に4本＋地区に散らして2本
    t.bz=[];
    for(const q of t.roads){                                  // 4つの入り口それぞれの内側に、主要な道と並行して走る商店街（必ず）
      const zr=q.ax==='z',e=q.s1-4,side=r()<.5?-1:1,p0=(zr?t.z:t.x)+q.sg*(e-22),p1=(zr?t.z:t.x)+q.sg*(e-22-160);
      t.bz.push({ax:q.ax,k:Math.round((q.c+side*30)/L),a0:Math.min(p0,p1),a1:Math.max(p0,p1)});
    }
    for(let i=0;i<1;i++){
      const ax=r()<.5?'x':'z',off=(r()<.5?-1:1)*(50+r()*t.R*.3),a0=t.R*(.55+r()*.1),len=140+r()*120,sg=r()<.5?-1:1,c0=ax==='x'?t.x:t.z,p0=c0+sg*a0,p1=c0+sg*(a0+len);
      t.bz.push({ax,k:Math.round(((ax==='x'?t.z:t.x)+off)/L),a0:Math.min(p0,p1),a1:Math.max(p0,p1)});
    }
  }
  if(KINGDOM_ATTACHED_CITY&&t&&!t.kind&&!EC&&r()<.22)t.city=makeMarketCity(t);   // 王国に市場都市が併設されるのは一部だけ
  if(!t&&!EC&&!forced&&r()<CITY_P){                         // 王国に付属しない独立都市＝砂漠の共和国（砂漠の中にだけ作る。西洋の共和国は西洋の街 euroOfCell の側で別に作る）
    let best=null,bs=1e9;
    for(let n=0;n<12;n++){
      const cx=(ix+.22+r()*.56)*TCELL,cz=(iz+.22+r()*.56)*TCELL,h=rawH(cx,cz);
      if(h<WATER+4||h>19||riverNear(cx,cz,260,35))continue;
      if(!townDesertOk(cx,cz,336)||!townLandOk(cx,cz,336))continue;       // 予定地がすべて砂漠で、海・湖にかからない所だけ（最大半径 300×1.12）
      let mn=h,mx=h;for(let j=0;j<8;j++){const hh=rawH(cx+Math.cos(j*.785)*180,cz+Math.sin(j*.785)*180);mn=Math.min(mn,hh);mx=Math.max(mx,hh)}
      if(mn<WATER+2.5||mx>24)continue;
      const score=mx-mn;if(score<bs){bs=score;best={x:cx,z:cz}}
    }
    if(best)t=makeMarketCity({x:best.x,z:best.z,R:0});
  }
  if(t&&EC){t.empire=EC.E;t.capital=EC.s.t==='c'}
  if(t){if(t.kind==='city'){t.settlementType='city';t.label=settlementLabel(t,'city');}else{t.settlementType='kingdom';t.label=t.capital?'王都':settlementLabel(t,'kingdom');}}
  if(t&&t.city){t.city.settlementType='city';t.city.label=settlementLabel(t.city,'city');}
  townCache.set(k,t);return t;
}
function nearTowns(x,z,reach){                                    // reachを渡すと、その距離まで届かない遠い区画の街は生成しない（省略=従来どおり周囲9区画）
  const ix=Math.floor(x/TCELL),iz=Math.floor(z/TCELL),a=[];
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){if(reach!==undefined&&!rectNear(ix+i,iz+j,TCELL,x,z,reach))continue;const t=townOfCell(ix+i,iz+j);if(t){a.push(t);if(t.city)a.push(t.city)}}
  return a;
}
function townGateOpen(t,ang){
  const ca=Math.cos(ang),sa=Math.sin(ang),edge=townEdgeBase(t,ang);let prev=rawH(t.x+ca*edge,t.z+sa*edge);
  if(prev<=WATER+3||rangeBump(t.x+ca*edge,t.z+sa*edge)>62)return false;
  for(let d=edge+24;d<=edge+420;d+=24){const xx=t.x+ca*d,zz=t.z+sa*d,h=rawH(xx,zz);
    if(h<=WATER+2.5||rangeBump(xx,zz)>72||mtBump(xx,zz)>42||Math.abs(h-prev)/24>.48)return false;prev=h}
  return true;
}
function townEdgeBase(t,ang){const u=(((ang/(2*Math.PI))%1)+1)%1*12,i=Math.floor(u),f=u-i,sm=f*f*(3-2*f);return t.R*(t.ctl[i]*(1-sm)+t.ctl[(i+1)%12]*sm)}
function townEdge(t,ang){
  const base=townEdgeBase(t,ang),key=Math.round((((ang/(2*Math.PI))%1+1)%1)*72);
  if(!t._edgeTerrain)t._edgeTerrain=new Map();if(t._edgeTerrain.has(key))return t._edgeTerrain.get(key);
  const a=key/72*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a);let limit=base,prev=rawH(t.x+ca*base*.48,t.z+sa*base*.48);
  for(let d=base*.48+30;d<=base+180;d+=30){const xx=t.x+ca*d,zz=t.z+sa*d,h=rawH(xx,zz);
    if(h<=WATER+2.5||rangeBump(xx,zz)>82||mtBump(xx,zz)>65||Math.abs(h-prev)/30>.72){limit=Math.min(limit,Math.max(base*.52,d-35));break}prev=h}
  t._edgeTerrain.set(key,limit);return limit;
}
function townIn(x,z,margin){                                     // (x,z)が街の内側（端からmargin以上）ならその街
  for(const t of nearTowns(x,z)){
    const dx=x-t.x,dz=z-t.z;
    if(Math.hypot(dx,dz)<=townEdge(t,Math.atan2(dz,dx))-margin)return t;
  }
  return null;
}
const FLATX=64;                                                 // 外壁の外 FLATX m までは平ら（低い外郭の壁・水路・門前の道のため）
let moatLast=0,platLast=0;                                                  // townWが同時に計算した水路の深さ（heightAtが使う）
function townW(x,z){                                             // 街の平坦化の重み(街の中=1、外側TBLENDでなめらかに0)
  let best=0,mo=0,pl=0;
  for(const t of nearTowns(x,z)){
    const dx=x-t.x,dz=z-t.z,d=Math.hypot(dx,dz),q=d-townEdge(t,Math.atan2(dz,dx)),pm=Math.max(Math.abs(dx),Math.abs(dz));
    if(pm<t.HS+1.5){const u=Math.min(1,(t.HS+1.5-pm)/3);pl=Math.max(pl,DH*u*u*(3-2*u))}     // 宮殿の城壁の内側は橋の高さ（壁の厚みの中でなめらかに立ち上げる）
    if(q>=FLATX+TBLEND)continue;
    let w=q<=FLATX?1:1-(q-FLATX)/TBLEND;w=w*w*(3-2*w);
    if(w>best)best=w;
    const a=Math.abs(q-49);                                      // 水路: 外壁の外 41〜57m（底は幅10m、両岸4mの斜面、深さ4m）
    if(a<9){const u=a<=5?1:(9-a)/4,m=4*u*u*(3-2*u);if(m>mo)mo=m}
  }
  moatLast=mo;platLast=pl;return best;
}
let _gnIx=NaN,_gnIz=NaN,_gnL=[];
function gateFlat(x,z){                                            // 門の内側（辺境伯領の入口）は、門の高さへ寄せて少し平らに。外側は国境の自然障壁の地形のまま
  const ix=Math.floor(x/ETC),iz=Math.floor(z/ETC);
  if(ix!==_gnIx||iz!==_gnIz){_gnIx=ix;_gnIz=iz;_gnL=[];const E=empireXZ((ix+.5)*ETC,(iz+.5)*ETC);if(E&&E.gates)for(const g of E.gates)if(Math.hypot(g.x-(ix+.5)*ETC,g.z-(iz+.5)*ETC)<ETC+500)_gnL.push(g)}
  let best=0,bh=0;
  for(const g of _gnL){const dx=x-g.x,dz=z-g.z,u=dx*g.ux+dz*g.uz,v=Math.abs(-dx*g.uz+dz*g.ux);
    if(u>40||u<-420||v>220)continue;
    const sm=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
    const w=sm((u+420)/220)*sm((40-u)/30)*sm((220-v)/130)*.6;
    if(w>best){best=w;bh=g.h}}
  return best>0?[best,bh]:null;
}
function heightAt(x,z){
  const raw=oasisCut(x,z,lakeCut(x,z,riverCut(x,z,rawH(x,z)))),w=townW(x,z);   // 湖は川の終点に掘る                // 大地形＋起伏 → 街で平坦化 → 水路を掘る
  let h=raw+(TOWN_H-raw)*w-moatLast+platLast;
  const c=caravanNear(x,z);                         // キャラバンサライの敷地は平らにならす（外側28mでなめらかに元の地形へ）
  if(c){const d=Math.hypot(Math.max(Math.abs(x-c.x)-(c.hw+6),0),Math.max(Math.abs(z-c.z)-(c.hd+6),0));if(d<28){let u=1-d/28;u=u*u*(3-2*u);h+=(c.h-h)*u}}
  {const tw=towerNear(x,z);if(tw){const d=Math.hypot(Math.max(Math.abs(x-tw.x)-TW_R,0),Math.max(Math.abs(z-tw.z)-TW_R,0));if(d<40){let u=1-d/40;u=u*u*(3-2*u);h+=(tw.h-h)*u}}}   // 塔の街の敷地は平らにならす（外側40mでなめらかに元の地形へ）
  {const nm=nomadNear(x,z);if(nm){const d=Math.hypot(x-nm.x,z-nm.z);if(d<nm.R+28){let u=d<nm.R?1:1-(d-nm.R)/28;u=u*u*(3-2*u);h+=(nm.h-h)*u}}}   // 遊牧民の拠点の敷地は平らにならす
  {const cm=campNear(x,z);if(cm){const d=Math.hypot(x-cm.x,z-cm.z);if(d<cm.R+28){let u=d<cm.R?1:1-(d-cm.R)/28;u=u*u*(3-2*u);h+=(cm.h-h)*u}}}   // 軍営の敷地は平らにならす
  const rg=rgNear(x,z);if(rg)h=rgHeight(rg,x,z,h);        // ゲートの敷地（穴はすり鉢）
  const gf=gateFlat(x,z);if(gf)h+=(gf[1]-h)*gf[0];            // 門の内側は少し平ら
  const ff=farmFlat(x,z);if(ff)h+=(ff[1]-h)*.85*ff[0];     // 村の畑も平ら気味に
  const pf=portFlat(x,z);if(pf)h+=(pf[1]-h)*pf[0];          // 港町の岸壁と街の敷地は平らに
  return h;
}
const rgCache=new Map(),rgGroups=new Map();let _rgIx=NaN,_rgIz=NaN,_rgC=null;
function rgOfCell(ix,iz){
  const k=ix+','+iz;if(rgCache.has(k))return rgCache.get(k);
  rgCache.set(k,null);
  const r=mulberry(hash(ix,iz,SEED+4242)*1e9|0);let c=null;
  if(r()<RGP){
    const ty=r()<.4?'arch':r()<.5?'hole':'door',R=ty==='hole'?RG_HR+4:12;let best=null,bs=1e9;
    if(ty==='door')return null;                                   // ドア型は街の外に建てない（街の家・城のドアに設定する）
    for(let n=0;n<8;n++){
      const x=(ix+.15+r()*.7)*RGC,z=(iz+.15+r()*.7)*RGC;
      let mn=1e9,mx=-1e9,sum=0;for(let i=0;i<9;i++){const d=i?R+14:0,h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h}
      if(mn<WATER+(ty==='hole'?16:5))continue;
      let gap=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z;gap=Math.min(gap,Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx)))}
      if(gap<RG_TOWN_GAP)continue;                                 // 街（砂漠の街）から2km以上離す
      if(mx-mn<bs){bs=mx-mn;best={x,z,h:sum/9}}
    }
    if(best&&bs<10){
      c={x:best.x,z:best.z,h:best.h,ty,R,yaw:Math.floor(r()*4)*Math.PI/2,rects:[],circs:[]};
      const cs=Math.round(Math.cos(c.yaw)),sn=Math.round(Math.sin(c.yaw));
      const RR=(lx,lz,w,d,top)=>c.rects.push({x:c.x+lx*cs+lz*sn,z:c.z-lx*sn+lz*cs,w:sn?d:w,d:sn?w:d,top:c.h+top,m:.3});
      if(ty==='arch'){RR(-4.5,0,3,3.2,8);RR(4.5,0,3,3.2,8)}
    }
  }
  rgCache.set(k,c);return c;
}
function rgNear(x,z){
  const ix=Math.floor(x/RGC),iz=Math.floor(z/RGC);
  if(ix!==_rgIx||iz!==_rgIz){_rgIx=ix;_rgIz=iz;_rgC=rgOfCell(ix,iz)}
  const c=_rgC;return c&&Math.abs(x-c.x)<c.R+40&&Math.abs(z-c.z)<c.R+40?c:null;
}
function rgClear(x,z){const c=rgOfCell(Math.floor(x/RGC),Math.floor(z/RGC));return !!c&&Math.hypot(x-c.x,z-c.z)<c.R+6}   // 木・岩を置かない範囲
function rgHeight(c,x,z,h){                                      // 敷地を平らにならす（外側26mでなめらかに戻す）。穴はすり鉢状に掘る
  const d=Math.hypot(x-c.x,z-c.z);let u=d<=c.R?1:d>=c.R+26?0:1-(d-c.R)/26;u=u*u*(3-2*u);h+=(c.h-h)*u;
  if(c.ty==='hole'&&d<RG_HR){let s=Math.min(1,Math.max(0,(d-3.5)/(RG_HR-3.5)));h=c.h-RG_HD*(1-s*s*(3-2*s))}
  return h;
}
let RG_M=null;
function rgMats(){return RG_M||(RG_M={stone:triplanar(new THREE.MeshPhongMaterial({color:0xb9b4a8,map:brickTex,shininess:1,specular:0x080808}),4.4,.9,.7),roof:new THREE.MeshLambertMaterial({color:0x6b3a2a}),door:new THREE.MeshLambertMaterial({color:0x4a2e1a}),dark:new THREE.MeshLambertMaterial({color:0x1b1511})})}
function addRGate(g,geos,c){
  const M=rgMats(),dm=new THREE.Object3D();g.position.set(c.x,c.h,c.z);g.rotation.y=c.yaw;
  const add=m=>{m.castShadow=m.receiveShadow=true;g.add(m);return m};
  const box=(w,h,d,x,y,z,mat)=>{const m=add(new THREE.Mesh(boxG,mat||M.stone));m.scale.set(w,h,d);m.position.set(x,y,z);return m};
  if(c.ty==='arch'){                                              // 足（靴）つきの石のアーチ。脚に帯
    const sh=new THREE.Shape();sh.moveTo(-6,0);sh.lineTo(-6,8);sh.absarc(0,8,6,Math.PI,0,true);sh.lineTo(6,0);sh.lineTo(3,0);sh.lineTo(3,8);sh.absarc(0,8,3,0,Math.PI,false);sh.lineTo(-3,0);sh.closePath();
    const eg=new THREE.ExtrudeGeometry(sh,{depth:3.2,bevelEnabled:false});geos.push(eg);add(new THREE.Mesh(eg,M.stone)).position.set(0,0,-1.6);
    for(const sx of[-1,1]){box(4.4,.5,5.4,sx*4.6,.25,.5);box(3.5,.35,3.7,sx*4.5,3.6,0);box(3.5,.35,3.7,sx*4.5,6.6,0)}
  }else{                                                          // 穴: 縁に石のブロックを一周
    const n=28,m=add(new THREE.InstancedMesh(boxG,M.stone,n));
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,hh=i%4?.9:1.7;dm.position.set(Math.cos(a)*(RG_HR-.5),hh/2,Math.sin(a)*(RG_HR-.5));dm.rotation.set(0,-a-Math.PI/2,0);dm.scale.set(2.4,hh,1.6);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)}
    m.frustumCulled=false;
  }
}
function clearRGates(){for(const g of rgGroups.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}rgGroups.clear()}
function updateRGates(){
  const ix=Math.floor(player.x/RGC),iz=Math.floor(player.z/RGC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,RGC,player.x,player.z,460))continue;const c=rgOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<330||(d<420&&rgGroups.has(key))){keep.add(key);if(!rgGroups.has(key)){const g=new THREE.Group(),geos=[];addRGate(g,geos,c);g.userData.geos=geos;scene.add(g);rgGroups.set(key,g)}}
  }
  for(const[k,g] of rgGroups)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());rgGroups.delete(k)}
}
const DGP=.05;                                                    // 村・港町の家のうち、玄関ドアがゲートになる割合
function doorGatesOf(v){                                          // 街の既存のドア（村・港町の家の玄関 / 城の正門）のうちゲートにするもの。位置は村ごとに一度だけ決める
  if(v.dgates)return v.dgates;
  const out=[];v.dgates=out;
  try{
    const k=v.castle;
    if(k&&k.kind==='simple'){                                      // 城（大きな正方形）の正面の門。床の高さは drawVillageCastle と同じ式
      const c=Math.cos(k.ry),s=Math.sin(k.ry),hw=k.w/2,hd=k.d/2;let mx=-1e9;
      for(let a=-1.3;a<=1.301;a+=.1)for(let b=-1.3;b<=1.301;b+=.1)if(Math.abs(a)<=1.1&&Math.abs(b)<=1.1)mx=Math.max(mx,heightAt(k.x+a*hw*c+b*hd*s,k.z-a*hw*s+b*hd*c));
      const gH=heightAt(k.x+(hd+3)*s,k.z+(hd+3)*c);
      out.push({x:k.x+hd*s,z:k.z+hd*c,y:Math.max(gH,mx-5)+.25,yaw:k.ry,ww:6.8,hh:9.8,castle:true});
    }
    for(const h of villageHousesOf(v)){                            // 村の家（石の台の広間・西洋風の家は除く）。玄関は局所+z側、横位置は h.dr*h.w*.27
      if(h.town||h.hall)continue;
      if(hash(Math.round(h.x*7),Math.round(h.z*7),SEED+4343)>=DGP)continue;
      const c=Math.cos(h.ry),s=Math.sin(h.ry),lx=(h.dr||0)*h.w*.27,lz=h.d/2;
      out.push({x:h.x+lx*c+lz*s,z:h.z-lx*s+lz*c,y:h.y0,yaw:h.ry,ww:1.1,hh:2.1});
    }
  }catch(err){console.error(err)}
  return out;
}
function warpRGate(){
  const list=dbgFind(RGC,rgOfCell,3,12);
  for(const v of VLIST.slice().sort((p,q)=>Math.hypot(p.cx-player.x,p.cz-player.z)-Math.hypot(q.cx-player.x,q.cz-player.z)).slice(0,12))   // 近い街の家・城のドア
    for(const dg of doorGatesOf(v))list.push({x:dg.x,z:dg.z,yaw:dg.yaw,ty:'door',R:0,dg});
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='ゲート: ±12km以内には無い';return}
  const vis=dbgVisited.rg||(dbgVisited.rg=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));
  const fx=Math.sin(pick.yaw),fz=Math.cos(pick.yaw),dist=pick.ty==='hole'?pick.R+6:pick.ty==='door'?(pick.dg.castle?30:7):24;                    // 正面(局所+z)の外から向く
  warpTo(pick.x+fx*dist,pick.z+fz*dist,Math.atan2(fx,fz));
  dbgMsg.textContent='ゲート('+({arch:'アーチ',hole:'穴',door:pick.dg&&pick.dg.castle?'城のドア':'街の家のドア'})[pick.ty]+')へ移動（'+vis.size+'/'+list.length+'か所目）';
}

// ---------- キャラバンサライ（砂漠の隊商宿）----------
// 砂漠の中の、街から離れた平らな所に1か所（1500m四方の区画ごとに最大1つ）。中心は日干しレンガの四角い建物（外の棟と内側の中庭）、北と南に門。
// 中庭の壁には荷を置くアーチの凹みが並び、前に絨毯・袋・壺・木箱が積んである。周りには白いテントがばらばらに張られている。
const cvCache=new Map(),cvGroups=new Map();let _cvIx=NaN,_cvIz=NaN,_cvC=null;
function caravanOfCell(ix,iz){
  const k=ix+','+iz;if(cvCache.has(k))return cvCache.get(k);
  cvCache.set(k,null);                                           // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+777)*1e9|0);
  let c=null;
  if(r()<.55){
    let best=null,bs=1e9;
    for(let n=0;n<10;n++){
      const x=(ix+.2+r()*.6)*CVC,z=(iz+.2+r()*.6)*CVC;
      if(climateAt(x,z).de<.75)continue;                          // 砂漠のまん中で
      let ok=true;for(let i=0;i<8&&ok;i++)if(climateAt(x+Math.cos(i*.785)*130,z+Math.sin(i*.785)*130).de<.6)ok=false;
      if(!ok)continue;
      let mn=1e9,mx=-1e9,sum=0;for(let i=0;i<9;i++){const d=i?60:0,h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h}
      if(mn<WATER+3.5)continue;                                  // 海・湖のそばは避ける
      let gap=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z;gap=Math.min(gap,Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx)))}
      if(gap<320)continue;                                       // 街から十分離れた所
      if(mx-mn<bs){bs=mx-mn;best={x,z,h:Math.min(30,Math.max(2.5,sum/9))}}
    }
    if(best)c=makeCaravan(best,r);
  }
  cvCache.set(k,c);return c;
}
function makeCaravan(b,r){
  const c={x:b.x,z:b.z,h:b.h,hw:CV_HW,hd:CV_HD,rects:[],circs:[],arches:[],goods:[],tents:[]};
  const iw=CV_HW-CV_RD,id=CV_HD-CV_RD,H=CV_H;
  const R=(lx,lz,w,d,top)=>c.rects.push({x:c.x+lx,z:c.z+lz,w,d,top:c.h+top,m:.3}),C=(lx,lz,rr)=>c.circs.push([c.x+lx,c.z+lz,rr]);
  R(-(CV_HW+iw)/2,0,CV_RD,2*id,H);R((CV_HW+iw)/2,0,CV_RD,2*id,H);                                  // 西・東の棟
  for(const sz of[-1,1])for(const sx of[-1,1]){R(sx*(CV_GATE+CV_HW)/2,sz*(id+CV_RD/2),CV_HW-CV_GATE,CV_RD,H);R(sx*CV_HW,sz*CV_HD,7,7,11)}   // 北・南の棟（門の左右）と角の塔
  const RUG=[0x9e2f2a,0x2d5a8a,0xc49a3a,0x5a3b28,0x7a2f5a,0x2f6b4f,0xb5573a,0xd8c9a0],SACK=[0xcdb98a,0xbfa878,0xd9c8a0],JAR=[0xb5683f,0xa65a38,0x8f4c30],WOOD=[0x7a5636,0x6a4a2c,0x8a6540];
  const pick=a=>a[Math.floor(r()*a.length)];
  const pile=(px,pz,ry,withSide)=>{                                                                  // 絨毯の山（長辺が壁に沿う）＋横に袋・壺・木箱
    const nr=3+Math.floor(r()*3);for(let i=0;i<nr;i++)c.goods.push({k:'rug',x:px+(r()-.5)*.2,y:i*.34+.17,z:pz+(r()-.5)*.2,ry:ry+(r()-.5)*.25,s:[2.0,.34,1.2],col:pick(RUG)});
    C(px,pz,1.25);
    if(!withSide)return;
    const nx=Math.cos(ry),nz=-Math.sin(ry);                                                           // 壁に沿う向き(局所x軸のワールド方向)
    for(const sd of[-1,1]){
      const sx=px+nx*sd*2.3,sz=pz+nz*sd*2.3,kind=r();
      if(kind<.4){for(let i=0;i<2;i++)c.goods.push({k:'sack',x:sx+(r()-.5)*.8,y:.38,z:sz+(r()-.5)*.8,ry:0,s:[.6,.4,.55],col:pick(SACK)});C(sx,sz,.9)}
      else if(kind<.75){for(let i=0;i<3;i++)c.goods.push({k:'jar',x:sx+(i-1)*.55,y:.45,z:sz+(r()-.5)*.5,ry:0,s:[.34,.9,.34],col:pick(JAR)});C(sx,sz,.9)}
      else{c.goods.push({k:'crate',x:sx,y:.4,z:sz,ry:ry+(r()-.5)*.3,s:[.9,.8,.9],col:pick(WOOD)},{k:'crate',x:sx+.1,y:1.2,z:sz,ry:ry+(r()-.5)*.5,s:[.8,.7,.8],col:pick(WOOD)});C(sx,sz,.9)}
    }
  };
  const nb=7,sp=2*iw/nb;                                                                             // 中庭の壁のアーチの凹み（北・南の壁）
  for(let i=0;i<nb;i++){const lx=-iw+sp*(i+.5);if(Math.abs(lx)<8)continue;
    for(const sz of[-1,1]){c.arches.push([lx,sz*id,sz<0?0:Math.PI]);pile(lx,sz*(id-1.7),sz<0?0:Math.PI,true)}}
  const nz=4,sq=2*id/nz;                                                                             // （西・東の壁）
  for(let i=0;i<nz;i++){const lz=-id+sq*(i+.5);
    for(const sx of[-1,1]){c.arches.push([sx*iw,lz,sx<0?Math.PI/2:-Math.PI/2]);pile(sx*(iw-1.7),lz,sx<0?Math.PI/2:-Math.PI/2,true)}}
  for(let i=0;i<5;i++){const px=(r()<.5?-1:1)*(7+r()*(iw-12)),pz=(r()-.5)*(2*id-10);pile(px,pz,r()*3.14,false)}   // 中庭にも荷の山
  C(0,0,2.1);                                                                                        // 中庭の井戸
  const tn=0;                                                                     // 白いテント（建物の周りにばらばら）
  for(let i=0;i<tn*8&&c.tents.length<tn;i++){
    const a=r()*6.283,rad=52+r()*72,x=Math.cos(a)*rad*1.15,z=Math.sin(a)*rad*.9;
    if(Math.abs(x)<CV_HW+17&&Math.abs(z)<CV_HD+17)continue;
    if(c.tents.some(t=>Math.hypot(t.x-x,t.z-z)<11))continue;
    const ridge=r()<.4,t={x,z,ridge,s:ridge?2.3+r()*.5:3+r()*1.1,len:6+r()*2.5,yaw:r()*6.283};c.tents.push(t);
    if(ridge){const dx=Math.sin(t.yaw)*t.len*.25,dz=Math.cos(t.yaw)*t.len*.25;C(x+dx,z+dz,t.s*.95);C(x-dx,z-dz,t.s*.95)}else C(x,z,t.s*.8);
  }
  return c;
}
function caravanClear(x,z){                                      // キャラバンサライの建物のすぐ外（壁から8m）までは木・岩を置かない（その外側はギリギリまで置く）
  const c=caravanOfCell(Math.floor(x/CVC),Math.floor(z/CVC));
  return !!c&&Math.abs(x-c.x)<c.hw+8&&Math.abs(z-c.z)<c.hd+8;
}
function caravanNear(x,z){
  const ix=Math.floor(x/CVC),iz=Math.floor(z/CVC);
  if(ix!==_cvIx||iz!==_cvIz){_cvIx=ix;_cvIz=iz;_cvC=caravanOfCell(ix,iz)}
  const c=_cvC;return c&&Math.abs(x-c.x)<c.hw+40&&Math.abs(z-c.z)<c.hd+40?c:null;
}
let CV_MATS=null;
function cvMats(){
  return CV_MATS||(CV_MATS={
    mud:triplanar(new THREE.MeshPhongMaterial({color:0xc58d68,map:brickTex,shininess:1,specular:0x080808}),4.4,.9,.7),    // 日干しレンガ
    dark:new THREE.MeshLambertMaterial({color:0x2a1b14}),
    arch:new THREE.MeshBasicMaterial({color:0x2c1c14}),
    goods:new THREE.MeshLambertMaterial({color:0xffffff}),
    tent:new THREE.MeshLambertMaterial({color:0xf3efe4,side:THREE.DoubleSide}),
    water:new THREE.MeshLambertMaterial({color:0x4a7c92})
  });
}
let tentRidgeG=null;
function addCaravan(g,geos,c){
  const M=cvMats(),dm=new THREE.Object3D(),HW=CV_HW,HD=CV_HD,RD=CV_RD,H=CV_H,iw=HW-RD,id=HD-RD,GT=CV_GATE;
  g.position.set(c.x,c.h,c.z);
  const add=m=>{m.castShadow=m.receiveShadow=true;g.add(m);return m};
  const box=(w,h,d,x,y,z,mat)=>{const m=add(new THREE.Mesh(boxG,mat||M.mud));m.scale.set(w,h,d);m.position.set(x,y,z);return m};
  const sh=new THREE.Shape();                                                                         // 北・南の棟: 門（尖頭アーチ）をくりぬいた断面を奥行きいっぱいに押し出す
  sh.moveTo(-HW,0);sh.lineTo(-GT,0);sh.lineTo(-GT,3.6);sh.quadraticCurveTo(-GT,5.4,0,6.4);sh.quadraticCurveTo(GT,5.4,GT,3.6);sh.lineTo(GT,0);sh.lineTo(HW,0);sh.lineTo(HW,H);sh.lineTo(-HW,H);sh.closePath();
  const eg=new THREE.ExtrudeGeometry(sh,{depth:RD,bevelEnabled:false});geos.push(eg);
  for(const sz of[-1,1]){const m=add(new THREE.Mesh(eg,M.mud));m.position.set(0,0,sz<0?-HD:HD-RD)}
  box(RD,H,2*id,-(HW+iw)/2,H/2,0);box(RD,H,2*id,(HW+iw)/2,H/2,0);                                    // 西・東の棟
  for(const sx of[-1,1])for(const sz of[-1,1]){box(7,11,7,sx*HW,5.5,sz*HD);box(7.8,.7,7.8,sx*HW,11.3,sz*HD)}   // 角の塔
  for(const sz of[-1,1])box(2*(GT+3.4),3,RD+1.6,0,H+1.5,sz*(HD-RD/2));                                 // 門の上の飾り壁
  const mer=[],put=(x,z,w,d)=>mer.push([x,z,w,d]);                                                    // 屋上の胸壁（外縁と中庭側の縁）
  for(let x=-HW+1.6;x<=HW-1.5;x+=3.2)for(const sz of[-1,1])if(Math.abs(x)>GT+3.6){put(x,sz*(HD-.5),1.6,.8)}
  for(let z=-HD+4.8;z<=HD-4.7;z+=3.2)for(const sx of[-1,1])put(sx*(HW-.5),z,.8,1.6);
  for(let x=-iw+1.6;x<=iw-1.5;x+=3.2)for(const sz of[-1,1])if(Math.abs(x)>GT+.4)put(x,sz*(id+.5),1.6,.8);
  for(let z=-id+1.6;z<=id-1.5;z+=3.2)for(const sx of[-1,1])put(sx*(iw+.5),z,.8,1.6);
  {const m=add(new THREE.InstancedMesh(boxG,M.mud,mer.length));mer.forEach((a,i)=>{dm.position.set(a[0],H+.55,a[1]);dm.rotation.set(0,0,0);dm.scale.set(a[2],1.1,a[3]);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)});m.frustumCulled=false}
  const win=[];                                                                                      // 外壁の小さな四角い窓
  for(let x=-HW+6;x<=HW-5;x+=7)if(Math.abs(x)>GT+5)for(const sz of[-1,1])win.push([x,4.6,sz*(HD+.06),1.1,1.5,.2]);
  for(let z=-HD+6;z<=HD-5;z+=7)for(const sx of[-1,1])win.push([sx*(HW+.06),4.6,z,.2,1.5,1.1]);
  {const m=add(new THREE.InstancedMesh(boxG,M.dark,win.length));win.forEach((a,i)=>{dm.position.set(a[0],a[1],a[2]);dm.rotation.set(0,0,0);dm.scale.set(a[3],a[4],a[5]);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)});m.frustumCulled=false;m.castShadow=false}
  if(c.arches.length){                                                                                // 中庭の壁のアーチの凹み（暗い開口＋縁取り）
    const im=new THREE.InstancedMesh(archG,M.arch,c.arches.length),fm=new THREE.InstancedMesh(frameG,frameM,c.arches.length),fcol=new THREE.Color(0xdcb690);
    c.arches.forEach((a,i)=>{
      const nx=Math.sin(a[2]),nz=Math.cos(a[2]);                                                       // 面の外向き法線（中庭側）
      dm.rotation.set(0,a[2],0);dm.scale.set(3.4,4.6,1);
      dm.position.set(a[0]+nx*.1,0,a[1]+nz*.1);dm.updateMatrix();fm.setMatrixAt(i,dm.matrix);fm.setColorAt(i,fcol);
      dm.position.set(a[0]+nx*.2,0,a[1]+nz*.2);dm.updateMatrix();im.setMatrixAt(i,dm.matrix);
    });
    im.frustumCulled=fm.frustumCulled=false;g.add(im,fm);
  }
  for(const[k,geom] of[['rug',boxG],['crate',boxG],['sack',ballG],['jar',towG]]){                       // 積み荷（絨毯・木箱・袋・壺）
    const list=c.goods.filter(o=>o.k===k);if(!list.length)continue;
    const m=add(new THREE.InstancedMesh(geom,M.goods,list.length)),col=new THREE.Color();
    list.forEach((o,i)=>{dm.position.set(o.x,o.y,o.z);dm.rotation.set(0,o.ry,0);dm.scale.set(o.s[0],o.s[1],o.s[2]);dm.updateMatrix();m.setMatrixAt(i,dm.matrix);m.setColorAt(i,col.setHex(o.col))});
    m.frustumCulled=false;
  }
  {const w=add(new THREE.Mesh(towG,M.mud));w.scale.set(1.85,1,1.85);w.position.set(0,.5,0);const wt=add(new THREE.Mesh(towG,M.water));wt.scale.set(1.35,.06,1.35);wt.position.set(0,1.04,0);wt.castShadow=false}   // 井戸（円柱の縁と水面）
  const py=c.tents.filter(t=>!t.ridge),rd=c.tents.filter(t=>t.ridge);                                  // 白いテント
  if(py.length){const cg=new THREE.ConeGeometry(1,1,4,1);cg.rotateY(Math.PI/4);geos.push(cg);
    const m=add(new THREE.InstancedMesh(cg,M.tent,py.length));
    py.forEach((t,i)=>{dm.position.set(t.x,heightAt(c.x+t.x,c.z+t.z)-c.h+t.s*.45-.1,t.z);dm.rotation.set(0,t.yaw,0);dm.scale.set(t.s*1.4,t.s*.9,t.s*1.4);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)});m.frustumCulled=false}
  if(rd.length){
    if(!tentRidgeG){const v=[-1,0,-1,1,0,-1,0,1.1,-1,-1,0,1,1,0,1,0,1.1,1],q=[0,3,5,0,5,2,1,2,5,1,5,4,0,1,2,3,5,4],a=[];for(const i of q)a.push(v[i*3],v[i*3+1],v[i*3+2]);tentRidgeG=new THREE.BufferGeometry();tentRidgeG.setAttribute('position',new THREE.Float32BufferAttribute(a,3));tentRidgeG.computeVertexNormals()}
    const m=add(new THREE.InstancedMesh(tentRidgeG,M.tent,rd.length));
    rd.forEach((t,i)=>{dm.position.set(t.x,heightAt(c.x+t.x,c.z+t.z)-c.h-.1,t.z);dm.rotation.set(0,t.yaw,0);dm.scale.set(t.s,t.s*.95,t.len/2);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)});m.frustumCulled=false}
}
function clearCaravans(){for(const g of cvGroups.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}cvGroups.clear()}
function updateCaravans(){
  const ix=Math.floor(player.x/CVC),iz=Math.floor(player.z/CVC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,CVC,player.x,player.z,460))continue;const c=caravanOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<330||(d<420&&cvGroups.has(key))){keep.add(key);if(!cvGroups.has(key)){const g=new THREE.Group(),geos=[];addCaravan(g,geos,c);g.userData.geos=geos;scene.add(g);cvGroups.set(key,g)}}
  }
  for(const[k,g] of cvGroups)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());cvGroups.delete(k)}
}
function dbgFind(cs,get,want,maxRing){                          // デバッグのワープ用: プレイヤーの区画から外側へ輪を広げ、want個以上見つかる（かつ2輪以上調べた）まで探す
  const cx=Math.floor(player.x/cs),cz=Math.floor(player.z/cs),out=[];
  for(let ring=0;ring<=maxRing;ring++){
    for(let a=-ring;a<=ring;a++)for(let b=-ring;b<=ring;b++){if(Math.max(Math.abs(a),Math.abs(b))!==ring)continue;const o=get(cx+a,cz+b);if(o)out.push(o)}
    if(out.length>=want&&ring>=2)break;
  }
  return out;
}
function warpCaravan(){
  const list=dbgFind(CVC,caravanOfCell,3,DBG_FAR);
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='キャラバンサライ: ±'+Math.round(DBG_FAR*CVC/1000)+'km以内には無い';return}
  const vis=dbgVisited.cv||(dbgVisited.cv=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));warpTo(pick.x,pick.z-pick.hd-16,Math.PI);                                         // 北の門の前から中を向く
  dbgMsg.textContent=`キャラバンサライへ移動（${vis.size}/${list.length}か所目）`;
}

// ---------- 塔の街（砂漠）----------
// 砂漠の平らな所に1か所（2200m四方の区画ごとに最大1つ）。高い円形の土台の上に、城壁に囲まれた街。
// 正面（南）に大階段と城門 → 入口のモスク（通りが抜ける）→ 中央に高い塔（内部は螺旋階段）と四角い回廊と中庭。東の中庭は二階建ての柱の建物が囲む。
// 一階（地面）で街・中庭へ。二階建ての建物 → 橋 → 城壁の塔 → 城壁の上を一周 → 北の塔 → 橋 → 回廊の屋上、と上からも回れる。
const TW_SAND=[0xdcc08a,0xd2b27c,0xe3cb9a,0xc9a56e,0xd9bf8c,0xe6d9bd];
const twCache=new Map(),twGroups=new Map();let _twIx=NaN,_twIz=NaN,_twC=null;
const twDomeG=new THREE.SphereGeometry(1,14,6,0,Math.PI*2,0,Math.PI/2),twDiscG=new THREE.CylinderGeometry(1,1,1,72);
function towerOfCell(ix,iz){
  const k=ix+','+iz;if(twCache.has(k))return twCache.get(k);
  twCache.set(k,null);                                           // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+4242)*1e9|0);
  let c=null;
  if(r()<.7){
    let best=null,bs=1e9;
    for(let n=0;n<20;n++){
      const x=(ix+.25+r()*.5)*TWC,z=(iz+.25+r()*.5)*TWC;
      if(climateAt(x,z).de<.8)continue;                           // 砂漠のまん中で
      let ok=true;for(let i=0;i<8&&ok;i++)if(climateAt(x+Math.cos(i*.785)*(TW_R+90),z+Math.sin(i*.785)*(TW_R+90)).de<.65)ok=false;
      if(!ok)continue;
      if(riverNear(x,z,TW_R+120,35)||mtBump(x,z)>0)continue;      // 川・山のそばは避ける
      let mn=1e9,mx=-1e9,sum=0,bad=false;
      for(let i=0;i<9;i++){const d=i?TW_R*.85:0,xx=x+Math.cos(i*.785)*d,zz=z+Math.sin(i*.785)*d,h=rawH(xx,zz);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h;if(mtBump(xx,zz)>0)bad=true}
      if(bad||mn<WATER+3.5||mx-mn>TW_FLAT)continue;                    // 海・湖・急な斜面は避ける
      let gap=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z;gap=Math.min(gap,Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx)))}
      if(gap<TW_R+260)continue;                                   // 街から離れた所
      {const i0=Math.floor(x/CVC),j0=Math.floor(z/CVC);let near=false;                                      // キャラバンサライとも離す
       for(let a=-1;a<=1&&!near;a++)for(let b=-1;b<=1;b++){const q=caravanOfCell(i0+a,j0+b);if(q&&Math.hypot(q.x-x,q.z-z)<TW_R+200){near=true;break}}
       if(near)continue}
      if(villageDist(x,z)<TW_R+150)continue;
      if(mx-mn<bs){bs=mx-mn;best={x,z,h:Math.min(30,Math.max(2.5,sum/9))}}
    }
    if(best)c=makeTower(best,r);
  }
  twCache.set(k,c);return c;
}
function makeTower(b,r){
  const c={x:b.x,z:b.z,h:b.h,rects:[],circs:[],roads:[],P:{B:[],A:[],G:[],Y:[],D:[],S:[],T:[],F:[],F2:[],F3:[],W:[]}},P=c.P;
  const pick=a=>a[Math.floor(r()*a.length)];
  const bx=(x,y0,z,w,h,d,col,ry)=>P.B.push([x,y0+h/2,z,w,h,d,col,ry||0]);                           // 箱（下端y0）
  const rc=(x,z,w,d,top,m)=>c.rects.push({x:c.x+x,z:c.z+z,w,d,top:c.h+top,m:m===undefined?.3:m});   // 当たり判定（上面top）
  const arch=(x,y,z,ry,w,h)=>P.A.push([x,y,z,ry,w,h]);
  const archF=(x,y,z,ry,w,h)=>{const sz=Math.min(2.4,Math.max(1,w/3.5));P.A.push([x,y,z,ry,w,h,1]);P.F.push([x,y,z,ry,w,h,sz]);P.F2.push([x,y,z,ry,w*.8,h*.8,sz]);P.F3.push([x,y,z,ry,w*.62,h*.62,sz])};   // 尖頭アーチ: 外の枠(一番出っ張る)→二重目→三重目と、内側へ段々に引っ込む（凹みの段差）   // 尖頭アーチの凹み＋壁から張り出す石の枠
  const glass=(x,y0,z,w,h,d)=>{};   // 青緑の窓は作らない（呼び出しは残してあるだけ）
  const cyl=(x,y0,z,rad,h,col)=>P.Y.push([x,y0+h/2,z,rad,h,col]);
  const dome=(x,y,z,rad,sy,col)=>P.D.push([x,y,z,rad,sy,col]);
  const spire=(x,y,z,s,h)=>P.S.push([x,y+h/2,z,s,h]);
  const GREEN=[0x6aa58d,0x5f9c86,0x78b09a],TRIM=0xeedcae,PIL=0xe9d6a6,WALL=0xd9bd86;
  const pil=(x,z,hw,y0,y1)=>{const n=Math.max(2,Math.round(hw*.9));for(let k=0;k<=n;k++){const u=-hw+.5+k*(2*hw-1)/n;for(const s of[-1,1]){bx(x+u,y0,z+s*hw,.8,y1-y0,.8,PIL);bx(x+s*hw,y0,z+u,.8,y1-y0,.8,PIL)}}};   // 4面の付け柱
  const PT=14;   // 土台の上面の高さ（城壁の内側の地面）
   // ---- イスラム建築の部品（建物の箱に後から載せるのではなく、壁→軒の持ち送り→胸壁→ドラム→尖頭ドームと、下から積み上げる） ----
   const hv=(x,z,k)=>hash(Math.round(x*4),Math.round(z*4),SEED+7700+k);                   // 位置で決まる乱数(0〜1)。r()を使わないので街の配置は変わらない
   const gc=(x,z)=>GREEN[Math.floor(hv(x,z,9)*3)%3];
   const crown=(x,z,w,d,y,mer)=>{                                                       // 軒: 二段の持ち送り（上へ張り出す）＋屋上の縁の胸壁
     bx(x,y-1.3,z,w+.7,.65,d+.7,TRIM);bx(x,y-.65,z,w+1.5,.65,d+1.5,TRIM);
     if(mer)cren(x,z,w+1.5,d+1.5,y);
   };
   const spand=(cx,cz,alongX,hw,y)=>{                                                     // 戸口の上の隅を階段状に埋めて、尖頭アーチの形にする
     for(let i=0;i<3;i++){const cw=hw*(.58-.19*i),o=hw-cw/2,yy=y-(i+1)*.6;
       for(const sg of[-1,1]){if(alongX)bx(cx+sg*o,yy,cz,cw,.62,1.4,TRIM);else bx(cx,yy,cz+sg*o,1.4,.62,cw,TRIM)}}
   };
   const wins=(x,z,w,d,y0,y1,side,dw,wy0)=>{                                              // 壁の尖頭アーチ窓（戸口の上・下は避ける）とタイルの帯
     const H=y1-y0;if(H<4.6)return;
     let wy=wy0!==undefined?wy0:y0+Math.max(2.4,H*.5),wh=Math.min(3.6,H*.34,y1-2.3-wy);
     if(wh>=1.5){
       for(const[sd,fx,fz,ry,L]of[['s',x,z+d/2,0,w],['n',x,z-d/2,Math.PI,w],['e',x+w/2,z,Math.PI/2,d],['w',x-w/2,z,-Math.PI/2,d]]){
         const n=Math.floor((L-1.5)/3.6);
         for(let k=0;k<n;k++){const u=(k-(n-1)/2)*3.6;if(side===sd&&Math.abs(u)<(dw||0)/2+1.4)continue;
           const sx=sd==='s'||sd==='n',px=sx?fx+u:fx,pz=sx?fz:fz+u,o=.12,ox=sd==='e'?o:sd==='w'?-o:0,oz=sd==='s'?o:sd==='n'?-o:0;
           const wa=[px+ox,wy,pz+oz,ry,1.5,wh];P.A.push(wa);wa.sill=P.B.length;
           bx(px,wy-.3,pz,sx?2:.55,.3,sx?.55:2,TRIM);}
       }
     }
    };
   const domed=(x,z,y,rad,col)=>{                                                         // 屋上のドーム: 台座→四角いドラム（窓つき）→円筒の首→尖ったドーム→金の尖塔。ドラムの四隅は小さな柱でつなぐ
     const dr=Math.max(1.2,rad),dh=dr*.8;
     bx(x,y,z,2*dr+.8,.7,2*dr+.8,TRIM);
     bx(x,y+.7,z,2*dr,dh,2*dr,WALL);
     for(const a of[-1,1])for(const b of[-1,1])bx(x+a*dr,y+.7,z+b*dr,.5,dh+.4,.5,TRIM);
     const ay=y+.7+dh*.2,ah=dh*.62;
     arch(x,ay,z+dr+.12,0,dr*.6,ah);arch(x,ay,z-dr-.12,Math.PI,dr*.6,ah);arch(x+dr+.12,ay,z,Math.PI/2,dr*.6,ah);arch(x-dr-.12,ay,z,-Math.PI/2,dr*.6,ah);
     bx(x,y+.7+dh,z,2*dr+.5,.4,2*dr+.5,TRIM);
     cyl(x,y+1.1+dh,z,dr*.95,.5,TRIM);
     dome(x,y+1.6+dh,z,dr*.98,1.4,col);
     spire(x,y+1.6+dh+dr*.98*1.4-.1,z,.22,dr*.9+1);
   };
   const minaret=(x,z,y0,h,rd,col)=>{if(col)rcb(x,z,rd*2.4,rd*2.4,y0,y0+h+5,.3);                                                         // ミナレット: 細い円柱の塔身→持ち送りのバルコニー→小さな円筒→尖った小ドーム
     cyl(x,y0-.2,z,rd,h+.2,WALL);cyl(x,y0+h*.55,z,rd*1.2,.35,TRIM);
     cyl(x,y0+h-.3,z,rd*1.45,.4,TRIM);cyl(x,y0+h+.1,z,rd*1.9,.45,TRIM);
     cyl(x,y0+h+.55,z,rd*1.25,.3,TRIM);cyl(x,y0+h+.85,z,rd*.95,2.2,WALL);
     dome(x,y0+h+3.05,z,rd*1.15,1.5,gc(x,z));spire(x,y0+h+3.05+rd*1.15*1.5-.1,z,.18,2.4);
   };
   const kiosk=(x,z,y)=>{                                                                 // 屋上の小さな東屋（柱4本＋小さなドーム）
     const s=1.7;for(const a of[-1,1])for(const b of[-1,1])bx(x+a*s,y,z+b*s,.45,2.4,.45,PIL);
     bx(x,y+2.4,z,2*s+1.2,.5,2*s+1.2,TRIM);dome(x,y+2.9,z,s+.3,1.3,gc(x,z));spire(x,y+2.9+(s+.3)*1.3-.1,z,.15,1.4);
   };
  const DARK=[0xa88a5e,0x9d8058,0xb59868];
  const stairs=(sx,fz,base,top)=>{                                                       // 大階段: 壁の前から手前(+z)へ下りる
    const rise=top-base,n=Math.ceil(rise/TW_RISE),rs=rise/n;
    for(let k=1;k<=n;k++){
      const zc=fz+TW_RUN*(n-k)+TW_RUN/2;
      bx(sx,base-.2,zc,TW_SW,rs*k+.2,TW_RUN,0xcdb078);
      for(const s of[-1,1])bx(sx+s*(TW_SW/2+.5),base-.2,zc,1,rs*k+1.3,TW_RUN,TRIM);
      rc(sx,zc,TW_SW,TW_RUN,base+rs*k,.12);
    }
  };
  const blk=(x,z,w,d,y0,y1,col,norc)=>{bx(x,y0-.2,z,w,y1-y0+.2,d,col);crown(x,z,w,d,y1,true);wins(x,z,w,d,y0,y1,null,0);if(!norc)rc(x,z,w,d,y1)};   // 箱＋軒＋当たり判定
  const cren=(x,z,w,d,y)=>{                                                              // 屋上の縁の胸壁
    for(let u=-w/2+1;u<=w/2-.9;u+=2.4)for(const s of[-1,1])bx(x+u,y,z+s*(d/2-.4),1.2,1,.7,TRIM);
    for(let v=-d/2+2.2;v<=d/2-2;v+=2.4)for(const s of[-1,1])bx(x+s*(w/2-.4),y,z+v,.7,1,1.2,TRIM);
  };
  const mini=(x,z,hw,y0,y1,norc,door)=>{                                                           // 小塔: 柱身＋付け柱＋青緑のガラス＋軒＋ドラム＋緑のドーム＋尖塔
    if(door)hut(x,z,2*hw,2*hw,y0,y1,WALL,door,2.4,1);else{bx(x,y0-.2,z,2*hw,y1-y0+.2,2*hw,WALL);bx(x,y1-1.1,z,2*hw+1.1,1.1,2*hw+1.1,TRIM);pil(x,z,hw,y0,y1-1.1)}
    const gh=(y1-y0)*.4;for(const s of[-1,1]){glass(x,y0+(y1-y0)*.3,z+s*(hw+.15),1.2,gh,.35);glass(x+s*(hw+.15),y0+(y1-y0)*.3,z,.35,gh,1.2)}
    cyl(x,y1,z,hw*.75,hw*.8,TRIM);dome(x,y1+hw*.8,z,hw*.9,1,pick(GREEN));spire(x,y1+hw*.8+hw*.9,z,.3,hw*1.1);
    if(!norc&&!door)rc(x,z,2*hw,2*hw,y1+hw*.8);
  };
  const hut=(x,z,w,d,y0,y1,col,side,dw,T)=>{                                              // 入口のある建物: 4面の壁(当たり判定つき)のうち side の面の中央を dw だけ開ける。中は歩ける
    T=T||1.4;const dh=Math.min(7,y1-y0-1.6);
    const wb=(cx,cz,lx,lz)=>{bx(cx,y0-.2,cz,lx,y1-y0+.2,lz,col);rc(cx,cz,lx,lz,y1)};
    for(const sd of['s','n']){const cz=z+(sd==='s'?1:-1)*(d/2-T/2);
      if(side===sd){const pw=(w-dw)/2;wb(x-(dw+pw)/2,cz,pw,T);wb(x+(dw+pw)/2,cz,pw,T);bx(x,y0+dh,cz,dw,y1-y0-dh,T,col);
        for(const q of[-1,1])bx(x+q*(dw/2+.25),y0,cz+(sd==='s'?.2:-.2),.5,dh,T+.4,TRIM);spand(x,cz,true,dw/2,y0+dh)}
      else wb(x,cz,w,T)}
    for(const sd of['e','w']){const cx=x+(sd==='e'?1:-1)*(w/2-T/2),L=d-2*T;
      if(side===sd){const pw=(L-dw)/2;wb(cx,z-(dw+pw)/2,T,pw);wb(cx,z+(dw+pw)/2,T,pw);bx(cx,y0+dh,z,T,y1-y0-dh,dw,col);
        for(const q of[-1,1])bx(cx+(sd==='e'?.2:-.2),y0,z+q*(dw/2+.25),T+.4,dh,.5,TRIM);spand(cx,z,false,dw/2,y0+dh)}
      else wb(cx,z,T,L)}
    crown(x,z,w,d,y1,true);wins(x,z,w,d,y0,y1,side,dw);                                     // 軒（二段の持ち送り＋胸壁）と、壁の尖頭アーチ窓
    if(y1-y0>=6){for(const sx of[-1,1])for(const sz of[-1,1])bx(x+sx*w/2,y0,z+sz*d/2,.9,y1-y0-1.3,.9,TRIM)}   // 四隅の付け柱
  };
  const rd=(x0,z0,x1,z1,hw)=>c.roads.push([x0,z0,x1,z1,hw]);                              // 地面の道（色を塗る。座標は街の中心から）
  const pv=(x0,z0,x1,z1,w)=>bx((x0+x1)/2,PT-.02,(z0+z1)/2,x0===x1?w:Math.abs(x1-x0),.14,z0===z1?w:Math.abs(z1-z0),0xe0cfa3);   // 基壇の上の舗装
  const rcb=(x,z,w,d,bot,top,m)=>c.rects.push({x:c.x+x,z:c.z+z,w,d,top:c.h+top,bot:c.h+bot,m:m===undefined?.3:m});   // 下端botから上面topまでの壁（下をくぐれる・上に立てる）
  const rcw=(x,z,w,d,top)=>c.rects.push({x:c.x+x,z:c.z+z,w,d,top:c.h+top,m:0,walk:true});                             // 薄い床・踏み面（横からは当たらない）
  const slab=(x0,x1,z0,z1,top,th,col)=>{bx((x0+x1)/2,top-th,(z0+z1)/2,x1-x0,th,z1-z0,col);rcw((x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,top)};   // 歩ける床板
  const rail=(x0,z0,x1,z1,y)=>{const cx=(x0+x1)/2,cz=(z0+z1)/2,lx=Math.max(.4,Math.abs(x1-x0)),lz=Math.max(.4,Math.abs(z1-z0));bx(cx,y,cz,lx,1.1,lz,TRIM);rcb(cx,cz,lx,lz,y-2,y+1.3,.15)};   // 手すり壁（見た目と当たり判定）
  const flight=(sx,sz,dir,w,y0,y1,rise,run,col,fill,rl)=>{                                    // 一直線の階段。(sx,sz)=下の端の中央。fill=地面から詰まった階段 / それ以外は宙に浮く板の階段
    const n=Math.round((y1-y0)/rise),rs=(y1-y0)/n,dx=dir==='E'?1:dir==='W'?-1:0,dz=dir==='S'?1:dir==='N'?-1:0;
    for(let k=1;k<=n;k++){
      const t=y0+rs*k,px=sx+dx*run*(k-.5),pz=sz+dz*run*(k-.5),lw=dx?run+.06:w,ld=dz?run+.06:w;
      if(fill){bx(px,y0-.2,pz,lw,t-y0+.2,ld,col);rc(px,pz,lw,ld,t,.12)}else{bx(px,t-1.6,pz,lw,1.6,ld,col);rcw(px,pz,lw,ld,t)}
      if(rl&&k%2===0)for(const o of rl)bx(dz?px+o:px,t,dz?pz:pz+o,dz?.3:run*2.2,1.1,dz?run*2.2:.3,TRIM);
    }
  };
  const spiral=(cx,cz,hs,y0,y1,sw,col)=>{                                                    // 四角い螺旋階段: 東の中央から北へ、時計回りに2.5周して西の中央に着く。角は sw×sw の平らな踊り場で、階段は踊り場と踊り場のあいだだけ（踊り場は手前の最後の段と同じ高さ・次の段は踊り場から1段上がる）
    const hw=sw/2,W=[[1,0],[1,-1],[-1,-1],[-1,1],[1,1],[1,-1],[-1,-1],[-1,1],[1,1],[1,-1],[-1,-1],[-1,0]].map(p=>[cx+p[0]*hs,cz+p[1]*hs]);
    const segs=[];let n=0;
    for(let i=0;i<W.length-1;i++){const A=W[i],B=W[i+1],l=Math.hypot(B[0]-A[0],B[1]-A[1]),a=i?hw:0,b=i<W.length-2?l-hw:l,m=Math.max(1,Math.round((b-a)/.5));segs.push({A,ux:(B[0]-A[0])/l,uz:(B[1]-A[1])/l,a,b,m});n+=m}
    const rs=(y1-y0)/n;let k=0;
    segs.forEach((S,i)=>{
      if(i){const t=y0+rs*k;bx(S.A[0],t-1.4,S.A[1],sw,1.4,sw,col);rcw(S.A[0],S.A[1],sw,sw,t)}   // 角の踊り場
      const run=(S.b-S.a)/S.m,vert=S.ux===0;
      for(let j=1;j<=S.m;j++){k++;const d=S.a+(j-.5)*run,px=S.A[0]+S.ux*d,pz=S.A[1]+S.uz*d,t=y0+rs*k,lw=vert?sw:run+.06,ld=vert?run+.06:sw;bx(px,t-1.4,pz,lw,1.4,ld,col);rcw(px,pz,lw,ld,t)}
    });
  };
  const hutD=(x,z,w,d,y0,y1,col,doors,T,nc)=>{                                                  // 戸口が高さ(dy)ごとに違う建物。doors=[[面('s','n','e','w'),戸口の床の高さ,幅,高さ,壁の中央からのずれ]]
    T=T||1.4;
    const seg=(cx,cz,lx,lz,ya,yb)=>{if(yb-ya<.05)return;const e=ya===y0?.2:0;bx(cx,ya-e,cz,lx,yb-ya+e,lz,col);rcb(cx,cz,lx,lz,ya,yb)};
    const wall=(sd,cx,cz,L,alongX)=>{
      const q=doors.find(a=>a[0]===sd),mk=(p0,p1,ya,yb)=>{const m=(p0+p1)/2,l=p1-p0;if(l<.05)return;if(alongX)seg(m,cz,l,T,ya,yb);else seg(cx,m,T,l,ya,yb)};
      if(!q){if(alongX)seg(cx,cz,L,T,y0,y1);else seg(cx,cz,T,L,y0,y1);return}
      const m0=alongX?cx:cz,c0=m0+(q[4]||0),lo=c0-q[2]/2,hi=c0+q[2]/2;
      mk(m0-L/2,lo,y0,y1);mk(hi,m0+L/2,y0,y1);mk(lo,hi,y0,q[1]);mk(lo,hi,q[1]+q[3],y1);   // 戸口の両脇の柱・敷居・まぐさ
    };
    wall('s',x,z+d/2-T/2,w,true);wall('n',x,z-d/2+T/2,w,true);wall('e',x+w/2-T/2,z,d-2*T,false);wall('w',x-w/2+T/2,z,d-2*T,false);
    if(!nc)crown(x,z,w,d,y1,false);
  };
  const pave=(cx,cz,w,d,y)=>bx(cx,(y===undefined?PT:y)-.02,cz,w,.14,d,0xe0cfa3);
  const portal=(cx,cz,sd,w,h,y0,opt)=>{                                                    // 門・入口の壁の浮き彫り: 戸口のまわりに二重の枠・付け柱・持ち送りの列・溝・上の飾り帯（壁から外へ張り出す）。opt 0=小(民家) 1=中 2=大(門・主塔)
    const nx=sd==='e'?1:sd==='w'?-1:0,nz=sd==='s'?1:sd==='n'?-1:0,ax=nz!==0;
    const B=(u,y,v,lu,hy,lv,col)=>bx(ax?cx+u:cx+nx*v,y,ax?cz+nz*v:cz+u,ax?lu:lv,hy,ax?lv:lu,col);   // u=壁に沿って / v=壁から外へ（厚みの中心）
    const W=w+[1.6,3.6,4.4][opt],Ht=h+[.9,3.2,5][opt],bar=[.35,.7,1.1][opt],DK=0xcdb078;
    for(const sg of[-1,1])B(sg*(W/2-bar/2),y0,.25,bar,Ht,.5,TRIM);                       // 外枠（左右）
    B(0,y0+Ht-bar,.25,W,bar,.5,TRIM);                                                     // 外枠（上）
    if(opt>=1){
      const ib=bar*.45,iw=W-bar*3.2;
      for(const sg of[-1,1])B(sg*(iw/2-ib/2),y0,.12,ib,Ht-bar*1.6,.3,DK);                 // 内側の枠（二重枠で溝をつくる）
      B(0,y0+Ht-bar*1.6-ib,.12,iw,ib,.3,DK);
      for(const sg of[-1,1]){const u=sg*(w/2+.65);B(u,y0,.3,.7,h*.9,.6,PIL);B(u,y0,.3,1.1,.5,.9,TRIM);B(u,y0+h*.9,.3,1.1,.45,.9,TRIM)}   // 戸口の両脇の付け柱（柱脚・柱頭つき）
      for(let q=0;q<2;q++){const yy=y0+h+q*.55,wd=w+1.2-q*1.4;for(let u=-wd/2+.4;u<=wd/2-.3;u+=.85)B(u,yy,.3+q*.18,.55,.5,.45,TRIM)}   // 戸口の上の持ち送り（二段で張り出す・ムカルナス風）
      const ph=Ht-bar*1.6-ib-(h+1.3)-.2;if(ph>.5)for(let u=-iw/2+.8;u<=iw/2-.7;u+=.9)B(u,y0+h+1.3,.15,.3,ph,.25,DK);   // 上の壁面の縦溝
      const fw=iw/2-ib-(w/2+1.2);if(fw>.6)for(const sg of[-1,1])B(sg*(w/2+1.2+fw/2),y0+.8,.15,Math.min(fw-.3,.5),h*.8,.25,DK);   // 脇の壁面の縦溝
    }
    B(0,y0+Ht,.4,W+(opt?.9:.5),.4,.8,TRIM);                                               // 軒の帯
    if(opt===2){B(0,y0+Ht+.4,.25,W+.3,.3,.55,WALL);for(let u=-W/2+.5;u<=W/2-.4;u+=1.6)B(u,y0+Ht+.7,.2,.7,.8,.45,TRIM)}   // 上の飾り胸壁
  };

  // ② 新しい構成（正面=+z=南、原点=街の中心）。高い土台の上に円形の城壁。正面の大階段(赤)→城門→入口のモスク(黄)→中央塔と回廊。
  //   緑=一階の道: 大階段→城門→モスクの通り抜け→東西の通り→東の中庭(二階建ての柱の建物)。
  //   青=上の道(高さF2): 東の建物の二階→橋→東の城壁の塔→城壁の上を一周→北の塔→橋→中央塔の回廊の屋上。
  //   紫=中央塔の内部の螺旋階段（地上から頂上の見張り台まで）。
  const WR=134,WTH=8,GY=PT,F2=GY+12,WT=F2,RF=GY+24,NS=48,STP=Math.PI*2/NS,SAND=TW_SAND;
  const disc=(x,y0,z,rad,h,col)=>P.W.push([x,y0+h/2,z,rad,h,col]);
  const TEAL=[0x3fa7a0,0x4fb0a6,0x35998f],tl=(x,z)=>TEAL[Math.floor(hv(x,z,9)*3)%3];
  const ribbed=(x,z,y,rad,sy,col)=>{dome(x,y,z,rad,sy,col);                                   // 青緑のドーム: 縁の輪＋3本の帯（リブ風）＋金の尖塔
    for(const f of[.16,.4,.64]){const rr=rad*Math.sqrt(1-f*f)+.18;cyl(x,y+f*rad*sy-.14,z,rr,.3,TRIM)}
    cyl(x,y-.1,z,rad+.25,.5,TRIM);spire(x,y+rad*sy-.2,z,.35,rad*.9+2)};
  // 土台（高さGY）: 滑らかな円盤＋当たり判定は細い帯で円に近づける
  // 土台は垂直な円筒ではなく、下ほど広がる段々の岩の崖（外から見て自然に）。段(2m)は跳んでも登れない高さ。各段にも当たり判定をつけ、段ごとに岩のかたまりを出して輪郭をくずし、足もとにも転がった岩を置く
  {const LN=7,rs=GY/LN,run=1.8,ROCK=[0xb89968,0xa88a5e,0xc2a274,0x9d8058,0xb59868,0xbfa070];
   const FR=(x,z)=>z>0&&Math.abs(x)<16;                                                   // 正面の大階段まわりは避ける
   const ring=(R,top)=>{for(let z0=-R;z0<R;z0+=6){const zf=Math.max(Math.abs(z0),Math.abs(z0+6)),hc=Math.sqrt(Math.max(0,R*R-zf*zf));if(hc>2)rc(0,z0+3,hc*2,6,top,.12)}};
   for(let k=0;k<LN;k++){const R=WR+6+run*(LN-1-k),top=rs*(k+1);
     disc(0,-.3,0,R,top+.3,k===LN-1?SAND[3]:ROCK[k%ROCK.length]);ring(R,top);
     const n=Math.round(2*Math.PI*R/9);
     for(let i=0;i<n;i++){const t=(i+hv(i,k,31)*.8)/n*Math.PI*2,rr=R+(hv(i,k,32)-.35)*2.4,x=rr*Math.sin(t),z=rr*Math.cos(t);
       if(FR(x,z)||k===LN-1)continue;
       const w=3+hv(i,k,33)*4,d=2+hv(i,k,34)*3,h=rs+.9+hv(i,k,35)*.6;
       bx(x,top-rs-.3,z,w,h,d,ROCK[(k+i)%ROCK.length],t+(hv(i,k,36)-.5)*.7)}}               // 段から張り出す岩のかたまり
   for(let i=0;i<70;i++){const t=hv(i,0,41)*Math.PI*2,rr=WR+6+run*(LN-1)+1.5+hv(i,0,42)*4,x=rr*Math.sin(t),z=rr*Math.cos(t);if(FR(x,z))continue;
     const w=2+hv(i,0,43)*2.6,h=1.2+hv(i,0,44)*1.8;bx(x,-.8,z,w,h+.8,w*.85,ROCK[i%ROCK.length],t+hv(i,0,45))}   // 足もとの転がった岩
  }
  // 城壁の塔の位置（45°ごと。k=0は城門）
  const wtp=[];for(let k=1;k<8;k++){const t=k*Math.PI/4;wtp.push([WR*Math.sin(t),WR*Math.cos(t)])}
  const nearTw=(x,z)=>wtp.some(q=>Math.abs(x-q[0])<10&&Math.abs(z-q[1])<10);
  // 城壁の輪: 48枚の回転した壁。上は通路（歩ける）。縁に胸壁と、落ちないための低い当たり判定
  for(let i=1;i<NS-1;i++){
    const t=(i+.5)*STP,sn=Math.sin(t),cs=Math.cos(t),px=WR*sn,pz=WR*cs,len=2*WR*Math.sin(STP/2)+.5;
    bx(px,GY-.2,pz,len,WT-GY+.2,WTH,SAND[0],t);
    for(let u=-7.2;u<=7.3;u+=3.6)for(const s of[-1,1]){const o=s*(WTH/2-.4);bx(px+u*cs+o*sn,WT,pz-u*sn+o*cs,1.8,1.1,.8,TRIM,t)}
    for(let u=-6;u<=6.1;u+=4){const mx=px+u*cs,mz=pz-u*sn;rc(mx,mz,WTH+1,WTH+1,WT,.3);
      for(const s of[-1,1]){const o=s*(WTH/2-.5),ex=mx+o*sn,ez=mz+o*cs;if(!nearTw(ex,ez))rcb(ex,ez,2.2,2.2,WT-1,WT+1.4,.15)}}
  }
  // 斜めの4か所は丸い稜堡（上は城壁の通路とつながる）＋外側にミナレット
  for(const k of[1,3,5,7]){const t=k*Math.PI/4,x=WR*Math.sin(t),z=WR*Math.cos(t);
    cyl(x,GY-.2,z,9.5,WT-GY+.2,SAND[2]);cyl(x,WT-1.2,z,10.5,1.2,TRIM);rc(x,z,12.5,12.5,WT,.3);
    minaret(x+Math.sin(t)*6.2,z+Math.cos(t)*6.2,WT,9,1.2,true)}
  // 北・東・西は入れる塔（通路が戸口から塔の中を通り抜ける）。北=橋で回廊へ、東=橋で二階建ての建物へ
  const wtower=(x,z,doors)=>{x=Math.round(x*100)/100;z=Math.round(z*100)/100;
    bx(x,GY-.2,z,14,WT-GY+.2,14,SAND[2]);rc(x,z,14,14,WT,.3);
    hutD(x,z,14,14,WT,WT+16,WALL,doors,1.4);
    for(const d of doors){const sd=d[0],o=d[4]||0;portal(sd==='e'?x+7:sd==='w'?x-7:x+o,sd==='s'?z+7:sd==='n'?z-7:z+o,sd,d[2],d[3],d[1],1)}   // 戸口の浮き彫り
    for(const y of[WT+8])for(const g of[-3,3]){arch(x+g,y,z+7.12,0,1.8,5);arch(x+g,y,z-7.12,Math.PI,1.8,5);arch(x+7.12,y,z+g,Math.PI/2,1.8,5);arch(x-7.12,y,z+g,-Math.PI/2,1.8,5)}
    domed(x,z,WT+16,4.6,pick(GREEN))};
  wtower(0,-WR,[['e',WT,6,7,0],['w',WT,6,7,0],['s',WT,5.4,7,0]]);
  wtower(WR,0,[['n',WT,6,7,0],['s',WT,6,7,0],['w',WT,5.4,7,0]]);
  wtower(-WR,0,[['n',WT,6,7,0],['s',WT,6,7,0]]);
  // 城門（正面）: 左右の門塔と、通り道をまたぐ楣。上は城壁の通路
  for(const sg of[-1,1]){const cx=sg*12.5;bx(cx,GY-.2,WR,13,WT-GY+.2,12,SAND[2]);rc(cx,WR,13,12,WT,.3);cren(cx,WR,13,12,WT);bx(cx,WT-1.2,WR,14.5,1.2,13.5,TRIM);minaret(sg*16.5,WR+3.5,WT,12,1.3,true);
    for(const y of[GY+3.5])for(const g of[-3,3]){archF(cx+g,y,WR+6.12,0,2.2,7);archF(cx+g,y,WR-6.12,Math.PI,2.2,7)}}
  bx(0,GY+9.5,WR,12.4,WT-GY-9.5,12,SAND[2]);rcb(0,WR,12.4,12,GY+9.5,WT,.3);crown(0,WR,12.4,12,WT,false);
  rail(-19,WR+5.6,19,WR+5.6,WT);rail(-19,WR-5.6,19,WR-5.6,WT);
  portal(0,WR+6,'s',12,9.5,GY,2);portal(0,WR-6,'n',12,9.5,GY,2);   // 城門の浮き彫り（外と内）
  // 正面の大階段（赤）: 地面から門の前の踊り場まで
  bx(0,-.3,WR+4,28,GY+.3,8,SAND[3]);rc(0,WR+4,28,8,GY,.3);
  flight(0,WR+8+16.8,'N',24,0,GY,TW_RISE,TW_RUN,0xcdb078,true,[-12.5,12.5]);
  rd(0,WR+20,0,TW_R+30,8);
  for(const z of[148,158])for(const s of[-1,1]){P.T.push([s*17,z,1.3,0]);c.circs.push([c.x+s*17,c.z+z,.7])}
  // 一階の道（緑）: 門→モスクの通り抜け→東西の通り→東の中庭
  pave(0,70,8,134);pave(-48,1,164,8);pave(65,1,62,8);

  // 入口のモスク（黄）: 通りがまんなかを抜ける。太い左右の棟（屋上に小ドームが3つずつ）と、通りの上の礼拝堂（大ドーム）、四隅のミナレット
  const MZ=28,MD=20,WC=18,WWd=24,MH=GY+26;
  for(const sg of[-1,1]){blk(sg*WC,MZ,WWd,2*MD,GY,MH,SAND[0]);
    minaret(sg*(WC+WWd/2-3.5),MZ-(MD-3),MH,18,1.5,true);minaret(sg*(WC+WWd/2-3.5),MZ+(MD-3),MH,18,1.5,true);
    bx(sg*WC,GY+12,MZ,WWd+.6,.8,2*MD+.6,TRIM);                                                 // 壁の帯
    for(const dz of[-12,0,12]){bx(sg*WC,MH,MZ+dz,9,.8,9,TRIM);ribbed(sg*WC,MZ+dz,MH+.8,3.8,1.4,tl(sg*WC,MZ+dz))}}   // 左右の棟の屋根の小ドーム
  bx(0,GY+9.5,MZ,12.4,MH-GY-9.5,2*MD,SAND[0]);rcb(0,MZ,12.4,2*MD,GY+9.5,MH,.3);crown(0,MZ,12.4,2*MD,MH,true);
  {const y=MH,dr=8.5;                                                                          // 中央の大ドーム: 四角いドラム（アーチ窓・四隅の付け柱）→首→青緑のドーム
   bx(0,y,MZ,2*dr+.8,.8,2*dr+.8,TRIM);bx(0,y+.8,MZ,2*dr,dr*1.1,2*dr,WALL);
   for(const a of[-1,1])for(const b of[-1,1])bx(a*dr,y+.8,MZ+b*dr,.7,dr*1.1+.5,.7,TRIM);
   for(const g of[-3,3]){archF(g,y+1.6,MZ+dr+.12,0,2.4,dr*.75);archF(g,y+1.6,MZ-dr-.12,Math.PI,2.4,dr*.75);archF(dr+.12,y+1.6,MZ+g,Math.PI/2,2.4,dr*.75);archF(-dr-.12,y+1.6,MZ+g,-Math.PI/2,2.4,dr*.75)}
   bx(0,y+.8+dr*1.1,MZ,2*dr+1,.5,2*dr+1,TRIM);cyl(0,y+1.3+dr*1.1,MZ,dr*.95,.7,TRIM);
   ribbed(0,MZ,y+2+dr*1.1,dr*1.02,1.5,0x3fa7a0)}
  for(const sg of[-1,1]){bx(sg*7.6,GY,MZ+MD+.8,2.6,26,3.2,TRIM);bx(sg*7.6,GY+26,MZ+MD+.8,3.2,.8,3.8,WALL)}   // 正面の門構え（両脇の太い柱）
  bx(0,GY+20,MZ+MD+.8,18,6.4,2.6,WALL);bx(0,GY+26.4,MZ+MD+.8,18.6,.8,3.2,TRIM);
  for(let u=-8;u<=8.1;u+=3.2)bx(u,GY+27.2,MZ+MD+.8,1.4,1.1,1.1,TRIM);                           // 門構えの上の胸壁
  archF(0,GY+10,MZ+MD+.12,0,11,10);for(const g of[-6,-2,2,6])archF(g,GY+21,MZ+MD+2.12,0,2.4,4.2);   // 通り抜けの上の大きな尖頭アーチと、その上の小アーチ
  for(const u of[-25,-20,-15,-10,10,15,20,25])for(const y of[GY+3,GY+15])archF(u,y,MZ+MD+.12,0,2.6,y>GY+10?7:9);
  for(const u of[-26,-21,-16,-11,11,16,21,26])for(const y of[GY+3,GY+15])archF(u,y,MZ-MD-.12,Math.PI,2.6,y>GY+10?7:9);
  for(const z of[MZ-12,MZ-4,MZ+4,MZ+12]){archF(-6.12,GY+3,z,Math.PI/2,2.6,9);archF(6.12,GY+3,z,-Math.PI/2,2.6,9)}
  portal(0,MZ-MD,'n',12.4,9.5,GY,2);   // モスクの奥（北）側の入口の浮き彫り

  // 中央の塔と回廊（紫）: 四角い回廊（一階は柱の廊下・屋上は歩ける）の中庭に、高い塔が立つ。塔の内部は地上から頂上までの螺旋階段
  const CX0=-24,CX1=24,CZ0=-54,CZ1=-6,IX0=-17,IX1=17,IZ0=-47,IZ1=-13;
  slab(CX0,CX1,CZ0,IZ0,F2,2,SAND[1]);slab(CX0,CX1,IZ1,CZ1,F2,2,SAND[1]);slab(IX1,CX1,IZ0,IZ1,F2,2,SAND[1]);slab(CX0,IX0,IZ0,-25,F2,2,SAND[1]);   // 屋上の通路（西の腕は階段の吹き抜けをあける）
  flight(-20.5,IZ1,'N',5,GY,F2,.5,.5,0xcdb078,false,[-2.7,2.7]);                                                                              // 地上→回廊の屋上
  for(let u=CX0;u<=CX1+.1;u+=5.5)for(const z of[CZ0,CZ1])bx(u,GY,z,1.4,F2-GY-2,1.4,PIL);
  for(let v=CZ0;v<=CZ1+.1;v+=5.5)for(const x of[CX0,CX1])bx(x,GY,v,1.4,F2-GY-2,1.4,PIL);
  for(let u=IX0;u<=IX1+.1;u+=5)for(const z of[IZ0,IZ1])bx(u,GY,z,1.2,F2-GY-2,1.2,PIL);
  for(let v=IZ0;v<=IZ1+.1;v+=5)for(const x of[IX0,IX1])bx(x,GY,v,1.2,F2-GY-2,1.2,PIL);
  rail(CX0,CZ0,-2.5,CZ0,F2);rail(2.5,CZ0,CX1,CZ0,F2);rail(CX0,CZ1,CX1,CZ1,F2);rail(CX0,CZ0,CX0,CZ1,F2);rail(CX1,CZ0,CX1,CZ1,F2);
  rail(IX0,IZ0,IX1,IZ0,F2);rail(IX0,IZ1,IX1,IZ1,F2);rail(IX0,IZ0,IX0,IZ1,F2);rail(IX1,IZ0,IX1,IZ1,F2);
  cren(0,-30,CX1-CX0,CZ1-CZ0,F2);
  for(const[mx,mz]of[[CX0+1.6,CZ0+1.6],[CX1-1.6,CZ0+1.6],[CX1-1.6,CZ1-1.6]])minaret(mx,mz,F2,10,1.1,true);
  {const TX=0,TZ=-30,TW=28,HW=TW/2,BW=HW+3,HS=9,SA=HS-1.75,SB=HS+1.75,LK=GY+70,Y1=LK+12,UW=20;const T0=1.6;
   hutD(TX,TZ,TW,TW,GY,Y1,WALL,[['e',GY,5.5,7,0],['w',LK,6,6,0]],1.6);                    // 東の戸口(地上・螺旋の入口)と西の戸口(見張り台)
   portal(TX+HW,TZ,'e',5.5,7,GY,2);portal(TX-HW,TZ,'w',6,6,LK,1);   // 主塔の戸口の浮き彫り
   for(const sx of[-1,1])for(const sz of[-1,1])bx(TX+sx*HW,GY,TZ+sz*HW,1.8,Y1-GY,1.8,TRIM);   // 四隅の太い付け柱
   for(let y=GY+16;y<LK-6;y+=18){const bo=HW-.4,bl=2*(HW-1.6);bx(TX,y,TZ-bo,TW+1.6,1.1,2.4,TRIM);bx(TX,y,TZ+bo,TW+1.6,1.1,2.4,TRIM);bx(TX-bo,y,TZ,2.4,1.1,bl,TRIM);bx(TX+bo,y,TZ,2.4,1.1,bl,TRIM)}                           // 横の帯（段を見せる）
   for(const[y,h]of[[GY+19,12],[GY+37,12],[GY+55,13]])for(const g of[-8,0,8]){                 // 3列×3段の尖頭アーチ（四面）
     archF(TX+g,y,TZ+HW+.12,0,2.2,h);archF(TX+g,y,TZ-HW-.12,Math.PI,2.2,h);archF(TX-HW-.12,y,TZ+g,-Math.PI/2,2.2,h);archF(TX+HW+.12,y,TZ+g,Math.PI/2,2.2,h)}
   bx(TX,GY,TZ,2*SA,LK-GY,2*SA,WALL);rcb(TX,TZ,2*SA,2*SA,GY,LK,.3);                      // 螺旋階段の中心の柱
   spiral(TX,TZ,HS,GY,LK,3.5,0xcdb078);
   slab(TX-SB,TX+SB,TZ+SA,TZ+SB,LK,1.2,TRIM);slab(TX+SA,TX+SB,TZ-SA,TZ+SA,LK,1.2,TRIM);slab(TX-SB,TX-SA,TZ-.2,TZ+SA,LK,1.2,TRIM);slab(TX-HW+T0-.05,TX-SB+.05,TZ-3.2,TZ+3.2,LK,1.2,TRIM);   // 頂上の床（階段の出口は西の戸口へ）＋床と戸口の敷居のあいだの隙間を埋める
   slab(TX-BW,TX+BW,TZ-BW,TZ-HW,LK,1.5,TRIM);slab(TX-BW,TX+BW,TZ+HW,TZ+BW,LK,1.5,TRIM);slab(TX-BW,TX-HW,TZ-HW,TZ+HW,LK,1.5,TRIM);slab(TX+HW,TX+BW,TZ-HW,TZ+HW,LK,1.5,TRIM);   // 見張り台（塔のまわりを一周）
   {const ri=HW-1.6,rt=(2*BW+1)/2-ri,rc2=ri+rt/2;bx(TX,LK-5,TZ-rc2,2*BW+1,3.5,rt,TRIM);bx(TX,LK-5,TZ+rc2,2*BW+1,3.5,rt,TRIM);bx(TX-rc2,LK-5,TZ,rt,3.5,2*ri,TRIM);bx(TX+rc2,LK-5,TZ,rt,3.5,2*ri,TRIM)}   // 見張り台の下の張り出しは壁のまわりだけ（塔の中の階段にふたをしない）
   rail(TX-BW,TZ-BW,TX+BW,TZ-BW,LK);rail(TX-BW,TZ+BW,TX+BW,TZ+BW,LK);rail(TX-BW,TZ-BW,TX-BW,TZ+BW,LK);rail(TX+BW,TZ-BW,TX+BW,TZ+BW,LK);
   bx(TX,Y1-.1,TZ,TW+3,1.2,TW+3,TRIM);cren(TX,TZ,TW+3,TW+3,Y1+1.1);                         // 頂部の持ち送りと胸壁
   bx(TX,Y1+1.1,TZ,UW,10,UW,WALL);                                                          // 上の段（一回り細い）
   for(const g of[-4.5,4.5]){const o=UW/2+.12;archF(TX+g,Y1+3,TZ+o,0,2.4,6);archF(TX+g,Y1+3,TZ-o,Math.PI,2.4,6);archF(TX+o,Y1+3,TZ+g,Math.PI/2,2.4,6);archF(TX-o,Y1+3,TZ+g,-Math.PI/2,2.4,6)}
   for(const sx of[-1,1])for(const sz of[-1,1]){bx(TX+sx*(UW/2-.7),Y1+1.1,TZ+sz*(UW/2-.7),1.3,10,1.3,TRIM);minaret(TX+sx*(UW/2+2.4),TZ+sz*(UW/2+2.4),Y1+1.1,5,.75)}   // 上の段の隅の柱と、四隅の小さな尖塔
   bx(TX,Y1+11.1,TZ,UW+2,1,UW+2,TRIM);cren(TX,TZ,UW+2,UW+2,Y1+12.1);
   cyl(TX,Y1+12.1,TZ,9,3,WALL);cyl(TX,Y1+15.1,TZ,9.8,.8,TRIM);
   ribbed(TX,TZ,Y1+15.9,9.6,1.5,0x3fa7a0);                                                    // 頂上の青緑の大ドーム
   for(const sx of[-1,1])for(const sz of[-1,1])minaret(TX+sx*(BW-.8),TZ+sz*(BW-.8),LK+1,8,.8)}

  // 内壁と中庭: 外壁のさらに内側。モスクの左右と奥を、胸壁つきの低い壁で囲む。東西の通りは門で通り抜け、中庭にはヤシを植える
  {const IW=32,TK=3,IH=GY+7.5,Z0=-70,Z1=MZ+MD;
   const wNS=(sx,za,zb)=>{const L=zb-za,cz=(za+zb)/2;bx(sx,GY-.2,cz,TK,IH-GY+.2,L,SAND[0]);rc(sx,cz,TK,L,IH,.3);
     for(let z=za+1.2;z<=zb-1;z+=2.4)for(const q of[-1,1])bx(sx+q*(TK/2-.4),IH,z,.7,1,1.2,TRIM)};
   for(const sx of[-IW,IW]){wNS(sx,Z0,-10);wNS(sx,12,Z1);
     for(const zt of[-7,9]){bx(sx,GY-.2,zt,6,12.2,6,SAND[2]);rc(sx,zt,6,6,GY+12,.3);cren(sx,zt,6,6,GY+12)}   // 東西の門の両脇の門塔
     bx(sx,GY+8.5,1,3.4,3,10,SAND[2]);rcb(sx,1,3.4,10,GY+8.5,GY+11.5,.3)}                                       // 門の上の楣
   {const L=2*IW+TK;bx(0,GY-.2,Z0,L,IH-GY+.2,TK,SAND[0]);rc(0,Z0,L,TK,IH,.3);                                    // 奥（北）の壁
    for(let x=-IW+.2;x<=IW-.2;x+=2.4)for(const q of[-1,1])bx(x,IH,Z0+q*(TK/2-.4),1.2,1,.7,TRIM)}
   for(const sx of[-IW,IW]){bx(sx,GY-.2,Z0,8,13.2,8,SAND[2]);rc(sx,Z0,8,8,GY+13,.3);cren(sx,Z0,8,8,GY+13);domed(sx,Z0,GY+13,3,pick(GREEN))}   // 奥の隅の塔
   for(const q of[-1,1])for(const z of[-62,-48,-30,-18]){P.T.push([q*27.5,z,1.3,GY]);c.circs.push([c.x+q*27.5,c.z+z,.7])}   // 回廊と内壁のあいだの中庭のヤシ
   for(const q of[-1,1])for(const x of[12,22]){P.T.push([q*x,-62,1.3,GY]);c.circs.push([c.x+q*x,c.z-62,.7])}}

  // 北の橋（青）: 回廊の屋上 → 北の城壁の塔（高さF2のまま一直線。下に橋脚）
  slab(-2.5,2.5,-127.5,CZ0,F2,3,SAND[2]);rail(-2.5,-127,-2.5,CZ0,F2);rail(2.5,-127,2.5,CZ0,F2);
  for(let z=-62;z>=-122;z-=12){bx(0,GY,z,5,F2-GY-3,3,SAND[2]);rc(0,z,5,3,F2-3,.3)}

  // 東の中庭（緑）: 二階建ての柱の建物が四方を囲む。一階は西の戸口（東西の通り）から入り、柱の廊下から中庭へ。二階・屋上へは内側の階段
  hutD(66,-3,60,82,GY,RF,WALL,[['w',GY,8,9,4],['e',F2,5.4,8,3]],1.8,true);
  portal(36,1,'w',8,9,GY,2);portal(96,0,'e',5.4,8,F2,1);   // 東の建物の戸口の浮き彫り
  for(const[bx0,bx1,bz0,bz1]of[[35.25,96.75,-44.75,-35],[35.25,96.75,29,38.75],[35.25,45,-35,29],[87,96.75,-35,17],[91.1,96.75,17,29]])bx((bx0+bx1)/2,RF-1.3,(bz0+bz1)/2,bx1-bx0,1.3,bz1-bz0,TRIM);   // 屋根の縁（軒）は屋上の床のある所だけ。中庭と屋上への階段の上にふたをしない                      // 外側の壁: 西=一階の入口 / 東=二階の戸口（東の橋へ）
  for(const y of[GY+1.5,F2+2]){
    for(let u=42;u<=90;u+=6){archF(u,y,-44.12,Math.PI,2.6,8);archF(u,y,38.12,0,2.6,8)}
    for(let v=-38;v<=34;v+=6){if(Math.abs(v-1)>7||y>GY+5)archF(35.88,y,v,-Math.PI/2,2.6,8);if(Math.abs(v)>6||y<GY+5)archF(96.12,y,v,Math.PI/2,2.6,8)}}
  slab(37.8,94.2,-42.2,-35,F2,1.4,SAND[1]);slab(37.8,94.2,29,36.2,F2,1.4,SAND[1]);slab(37.8,45,-35,17,F2,1.4,SAND[1]);slab(87,94.2,-35,29,F2,1.4,SAND[1]);        // 二階の床（西の階段の吹き抜けをあける）
  slab(37.8,94.2,-42.2,-35,RF,1.4,SAND[1]);slab(37.8,94.2,29,36.2,RF,1.4,SAND[1]);slab(37.8,45,-35,29,RF,1.4,SAND[1]);slab(87,94.2,-35,17,RF,1.4,SAND[1]);slab(91.1,94.2,17,29,RF,1.4,SAND[1]);rail(91,17,91,29,RF);      // 屋上の床（東の階段の吹き抜けをあける）
  flight(41.5,29,'N',5,GY,F2,.5,.5,0xcdb078,false,[-2.7,2.7]);                              // 一階→二階
  flight(89.4,17,'S',3,F2,RF,.5,.5,0xcdb078,false,[-1.6,1.6]);                              // 二階→屋上（向きを反対に: 二階の通路を南へ回ると、階段の下の端に着く。上りきると屋上の南の通路）
  for(const y0 of[GY,F2]){const hh=(y0===GY?F2:RF)-y0-1.4;
    for(let u=45;u<=87.1;u+=6)for(const z of[-35,29])bx(u,y0,z,1.2,hh,1.2,PIL);
    for(let v=-35;v<=29.1;v+=6)for(const x of[45,87])bx(x,y0,v,1.2,hh,1.2,PIL)}
  for(const y of[F2,RF]){rail(45,-35,87,-35,y);rail(45,29,87,29,y);rail(45,-35,45,29,y);rail(87,-35,87,29,y)}
  cren(66,-3,60,82,RF);
  for(const[tx,tz,sd,sd2,o2]of[[41,-38,'e','s',0],[91,-38,'w','s',0],[41,32,'e','n',0],[91,32,'w','n',1.5]]){hutD(tx,tz,9,9,RF,RF+13,WALL,[[sd,RF,3.6,7,0],[sd2,RF,3.6,7,o2]],1.2);domed(tx,tz,RF+13,3.2,pick(GREEN))}   // 屋上の四隅の小塔
  for(const[px,pz]of[[55,-20],[77,-20],[55,14],[77,14]]){P.T.push([px,pz,1.3,GY]);c.circs.push([c.x+px,c.z+pz,.7])}
  // 東の橋（青）: 二階建ての建物の二階 → 東の城壁の塔
  slab(96,127.5,-2.5,2.5,F2,3,SAND[2]);rail(96,-2.5,127,-2.5,F2);rail(96,2.5,127,2.5,F2);
  for(const x of[106,116]){bx(x,GY,0,3,F2-GY-3,5,SAND[2]);rc(x,0,3,5,F2-3,.3)}

  // ---- 街並み: 通り（大通り・東西の通り）と路地で区切った街区に、家を間隔をあけて建てる。中心ほど高く、外へ向かって低くなる段々の街。広場・露店・ヤシ・屋上の日よけで抜けをつくる（参考画像: 日干しレンガの家が段々に重なり、あいだに広場と露店がある）。民家の中には入れない
  {
    const XS=[-131,-107,-83,-59,-35,0,35,99,131],ZS=[-131,-102,-74,1,52,76,100,131];
    const hwl=(arr,i)=>i===0||i===arr.length-1?0:arr[i]===0||arr[i]===1?6:3.4;            // 通りの半幅（大通り=x0・東西の通り=z1は広く、あとは路地）
    const EXC2=[[0,-12,72,126],[66,-3,66,88],[0,132,44,16]];                                // 内壁の中・東の建物・正面の門まわりには建てない
    const inEx=(x0,x1,z0,z1)=>EXC2.some(q=>x1>q[0]-q[2]/2-.5&&x0<q[0]+q[2]/2+.5&&z1>q[1]-q[3]/2-.5&&z0<q[1]+q[3]/2+.5);
    const RL=125,AWN=[0x2f8f6a,0xc23a2e,0xd9772b,0x2f6fb0,0x8a4f9e,0xe0b341],LV=3.1,WOOD=0x6b4a2b;
    const palm=(x,z)=>{P.T.push([x,z,1.3,GY]);c.circs.push([c.x+x,c.z+z,.7])};
    const stall=(x,z,alongX)=>{                                                          // 露店: 柱4本＋色つきの日よけ＋売り台と荷（台は当たり判定つき）
      const w=alongX?4.2:2.6,d=alongX?2.6:4.2,c0=pick(AWN);
      for(const a of[-1,1])for(const b of[-1,1])bx(x+a*(w/2-.15),GY,z+b*(d/2-.15),.3,3,.3,WOOD);
      bx(x,GY+3,z,w+.6,.22,d+.6,c0);bx(x,GY+2.75,z,w+.6,.3,d+.6,TRIM,0);
      bx(x,GY,z,alongX?w-.8:.9,.95,alongX?.9:d-.8,WOOD);rc(x,z,alongX?w-.8:.9,alongX?.9:d-.8,GY+.95,.15);
      for(let k=-1;k<=1;k++)bx(alongX?x+k*1:x,GY+.95,alongX?z:z+k*1,.6,.4,.6,pick(AWN))};
    const rawn=(x,z,top,w,d)=>{                                                          // 屋上の日よけ（柱2本＋斜めでなく平らな布）
      const c0=pick(AWN);for(const s of[-1,1])bx(x+s*(w/2-.2),top,z,.25,2.2,d*.8,WOOD);
      bx(x,top+2.2,z,w,.2,d,c0)};
    const H=[];
    const house=(x0,x1,z0,z1,ex)=>{
      if(inEx(x0,x1,z0,z1))return;
      for(const[cx,cz]of[[x0,z0],[x1,z0],[x0,z1],[x1,z1]])if(Math.hypot(cx,cz)>RL)return;
      const W0=x1-x0,D0=z1-z0;
      if(W0>9&&D0>9&&r()<.2){                                                              // 広場: 舗装・井戸・露店・ヤシ（建てずに抜けをつくる）
        const x=(x0+x1)/2,z=(z0+z1)/2;pave(x,z,W0,D0);
        const kind=r();
        if(kind<.35){cyl(x,GY,z,1.5,1.1,WALL);c.circs.push([c.x+x,c.z+z,1.7]);palm(x0+2,z0+2);palm(x1-2,z1-2)}
        else if(kind<.75){const n=Math.max(1,Math.min(3,Math.floor(W0/6)));for(let k=0;k<n;k++)stall(x0+(k+.5)*W0/n,z0+2.4+(r()<.5?0:D0-4.8),true);palm(x,z)}
        else{palm(x-W0*.25,z-D0*.2);palm(x+W0*.25,z+D0*.2);if(W0>12)palm(x,z+D0*.3)}
        return}
      if(r()<.08)return;                                                                   // ときどき空き地（路地がふくらむ）
      // 家と家のあいだに隙間: 各辺を少し内側へ
      x0+=.9+r()*1.3;x1-=.9+r()*1.3;z0+=.9+r()*1.3;z1-=.9+r()*1.3;
      const w=x1-x0,d=z1-z0,x=(x0+x1)/2,z=(z0+z1)/2;
      if(w<4||d<4)return;
      ex={n:true,s:true,e:true,w:true};
      const rr=Math.hypot(x,z)/RL;let lv=2+Math.floor((1-rr)*2.2+r()*1.6),ht=lv*LV;
      const wb=Math.hypot(x,z)>96&&r()<.4;if(wb){lv=4;ht=F2-GY}                          // 城壁ぎわの家の一部は屋上を城壁の通路と同じ高さにして、橋でつなぐ
      const col=pick(SAND),top=GY+ht;H.push({x0,x1,z0,z1,lv,top,wb,x,z});
      bx(x,GY-.2,z,w,ht+.2,d,col);rc(x,z,w,d,top,.2);
      bx(x,top-1.1,z,w+.5,.4,d+.5,TRIM);                                                   // 軒
      if(r()<.4)cren(x,z,w,d,top);                                                         // 屋上の縁: 胸壁 / 低い壁
      else{bx(x,top,z-d/2+.25,w,.9,.5,TRIM);bx(x,top,z+d/2-.25,w,.9,.5,TRIM);bx(x-w/2+.25,top,z,.5,.9,d-1,TRIM);bx(x+w/2-.25,top,z,.5,.9,d-1,TRIM)}
      for(const[sd,fx,fz,ry,L,tx,tz]of[['s',x,z+d/2,0,w,1,0],['n',x,z-d/2,Math.PI,w,1,0],['e',x+w/2,z,Math.PI/2,d,0,1],['w',x-w/2,z,-Math.PI/2,d,0,1]]){
        const ox=sd==='e'?1:sd==='w'?-1:0,oz=sd==='s'?1:sd==='n'?-1:0,n=Math.max(1,Math.floor((L-1.2)/3.2));
        for(let k=0;k<L-1;k+=2.4){const u=-L/2+.9+k;bx(fx+tx*u+ox*.3,top-1.7,fz+tz*u+oz*.3,tx?.3:.8,.3,tz?.3:.8,WOOD)}   // 梁の先端（日干しレンガの家らしい）
        for(let f=0;f<lv;f++)for(let k=0;k<n;k++){
          const u=(k-(n-1)/2)*3.2+(r()-.5)*.6;if(r()<.18)continue;
          const px=fx+tx*u+ox*.12,pz=fz+tz*u+oz*.12;
          if(f===0){if(k===(n>>1)||r()<.25){archF(px,GY,pz,ry,1.6,2.8);portal(fx+tx*u,fz+tz*u,sd,1.6,2.8,GY,0)}}                      // 入口（枠つき）
          else arch(px,GY+f*LV+.9,pz,ry,1,1.5)}                                             // 上の階の窓
        if(r()<.45){const aw=Math.min(L-1,5),ax=fx+ox*1.4,az=fz+oz*1.4,c0=pick(AWN);        // 一階の日よけ（縞の縁つき）
          const ux=tx*(r()-.5)*(L-aw),uz=tz*(r()-.5)*(L-aw);
          bx(ax+ux,GY+3,az+uz,tx?aw:2.6,.25,tz?aw:2.6,c0);bx(ax+ux+ox*.9,GY+2.75,az+uz+oz*.9,tx?aw:.3,.35,tz?aw:.3,TRIM)}
      }
      const roll=r();
      if(roll<.14&&w>7&&d>7)domed(x,z,top,Math.min(w,d)*.28,r()<.3?0xe8e2cf:pick(GREEN));
      else if(roll<.26&&w>6&&d>6)kiosk(x+(r()-.5)*(w-6),z+(r()-.5)*(d-6),top);
      else if(roll<.62&&ht>=9&&w>8&&d>8){                                                  // 屋上のもう一段（段々の街）: 片側に寄せて、手前をテラスにする
        const sw=r()<.5?1:-1,sz2=r()<.5?1:-1,uw=w*(.5+r()*.2),ud=d*(.5+r()*.2),ux=x+sw*(w-uw)/2,uz=z+sz2*(d-ud)/2,uh=LV*(r()<.5?1:2);
        bx(ux,top,uz,uw,uh,ud,pick(SAND));bx(ux,top+uh-1.1,uz,uw+.5,.4,ud+.5,TRIM);cren(ux,uz,uw,ud,top+uh);
        arch(ux,top+.1,uz+(ud/2+.12)*sz2,sz2>0?0:Math.PI,1.4,2.4);
        if(r()<.6)rawn(x-sw*(w-uw)/2,z-sz2*(d-ud)/2,top,Math.min(4.5,w-uw-.6>3?w-uw-.6:3.5),Math.min(3.5,d*.35));
        if(r()<.3&&uw>6&&ud>6)domed(ux,uz,top+uh,Math.min(uw,ud)*.22,pick(GREEN))}
      else if(roll<.74)rawn(x+(r()-.5)*(w-5),z+(r()-.5)*(d-4),top,4,3);
      else if(roll<.82)cyl(x+(r()-.5)*(w-3),top,z+(r()-.5)*(d-3),1,1.5,WALL);               // 水タンク
      else if(roll<.88&&ht>=12)minaret(x+w/2-1.2,z+d/2-1.2,top,8,.8);
    };
    const lots=(x0,x1,z0,z1,ex)=>{
      const w=x1-x0,d=z1-z0;
      if(w>20&&(w>=d||d<=20)){const m=x0+w*(.38+.24*r());lots(x0,m,z0,z1,ex);lots(m,x1,z0,z1,ex);return}
      if(d>20){const m=z0+d*(.38+.24*r());lots(x0,x1,z0,m,ex);lots(x0,x1,m,z1,ex);return}
      house(x0,x1,z0,z1,ex)};
    const block=(x0,x1,z0,z1,ex)=>{
      const w=x1-x0,d=z1-z0;if(w<4||d<4)return;
      if(w>36&&w>=d){const m=x0+w*(.4+.2*r());block(x0,m-2,z0,z1,ex);block(m+2,x1,z0,z1,ex);return}
      if(d>36){const m=z0+d*(.4+.2*r());block(x0,x1,z0,m-2,ex);block(x0,x1,m+2,z1,ex);return}
      lots(x0,x1,z0,z1,ex)};
    for(let i=0;i<XS.length-1;i++)for(let j=0;j<ZS.length-1;j++)
      block(XS[i]+hwl(XS,i),XS[i+1]-hwl(XS,i+1),ZS[j]+hwl(ZS,j),ZS[j+1]-hwl(ZS,j+1),{n:true,s:true,e:true,w:true});
    // 上の道: 同じ高さの家の屋上どうしを路地ごしの橋でつなぎ、城壁ぎわの家は城壁の通路へも橋をかける（上の道は橋で、ある程度つながる）
    {const cnt=new Map(),n0=h=>cnt.get(h)||0,up=h=>cnt.set(h,n0(h)+1);
     const clr=(a0,a1,b0,b1,self)=>!inEx(a0,a1,b0,b1)&&!H.some(h=>!self.includes(h)&&h.x1>a0&&h.x0<a1&&h.z1>b0&&h.z0<b1);
     const bridge=(x0,x1,z0,z1,top)=>{slab(x0,x1,z0,z1,top,1.2,SAND[2]);
       if(x1-x0>=z1-z0){rail(x0,z0,x1,z0,top);rail(x0,z1,x1,z1,top)}else{rail(x0,z0,x0,z1,top);rail(x1,z0,x1,z1,top)}};
     for(let i=0;i<H.length;i++)for(let j=i+1;j<H.length;j++){
       const a=H[i],b=H[j];if(a.top!==b.top||n0(a)>=2||n0(b)>=2)continue;
       const L=a.x1<=b.x0?a:b.x1<=a.x0?b:null,Rr=L===a?b:a;
       if(L){const gap=Rr.x0-L.x1,o0=Math.max(a.z0,b.z0)+1.8,o1=Math.min(a.z1,b.z1)-1.8;
         if(gap>=1&&gap<=11.5&&o1>=o0&&r()<.55){const zc=(o0+o1)/2;
           if(clr(L.x1,Rr.x0,zc-1.3,zc+1.3,[a,b])){bridge(L.x1-.4,Rr.x0+.4,zc-1.3,zc+1.3,a.top);up(a);up(b);continue}}}
       const T=a.z1<=b.z0?a:b.z1<=a.z0?b:null,B2=T===a?b:a;
       if(T){const gap=B2.z0-T.z1,o0=Math.max(a.x0,b.x0)+1.8,o1=Math.min(a.x1,b.x1)-1.8;
         if(gap>=1&&gap<=11.5&&o1>=o0&&r()<.55){const xc=(o0+o1)/2;
           if(clr(xc-1.3,xc+1.3,T.z1,B2.z0,[a,b])){bridge(xc-1.3,xc+1.3,T.z1-.4,B2.z0+.4,a.top);up(a);up(b)}}}}
     for(const h of H){if(!h.wb||r()<.35)continue;                                           // 城壁の通路へ
       const ax=Math.abs(h.x)>Math.abs(h.z),sg=ax?Math.sign(h.x):Math.sign(h.z);
       if(!ax&&sg>0&&Math.abs(h.x)<32)continue;                                              // 正面の門まわりは避ける
       const mid=ax?(h.z0+h.z1)/2:(h.x0+h.x1)/2,cc=Math.max(-40,Math.min(40,mid)),
         we=Math.sqrt(130*130-cc*cc)+1.2;
       if(ax){const a0=sg>0?h.x1-.4:-we,a1=sg>0?we:h.x0+.4;
         if(a1-a0>2&&clr(sg>0?h.x1:-we,sg>0?we:h.x0,cc-1.5,cc+1.5,[h])){bridge(a0,a1,cc-1.5,cc+1.5,h.top)}}
       else{const a0=sg>0?h.z1-.4:-we,a1=sg>0?we:h.z0+.4;
         if(a1-a0>2&&clr(cc-1.5,cc+1.5,sg>0?h.z1:-we,sg>0?we:h.z0,[h])){bridge(cc-1.5,cc+1.5,a0,a1,h.top)}}}}
    pave(0,-99,8,54);                                                                       // 奥（北）の大通り
    for(const sx of[-83,-59])pave(sx,-42,3,150);                                       // 路地の舗装（石畳）
  }
  for(const z of[60,100])for(const s of[-1,1]){P.T.push([s*3.2,z,1.3,GY]);c.circs.push([c.x+s*3.2,c.z+z,.7])}   // 大通りのヤシ
  // ---- 窓の整理（最後に1回）: ①枠つきアーチと重なる小窓は消す ②枠つきアーチの下を「床まで脚を伸ばす」か「窓台で閉じる」で仕上げる ----
  {const pl=a=>{const hx=Math.abs(Math.cos(a[3]))>.5;return{n:hx?'z':'x',p:hx?a[2]:a[0],u:hx?a[0]:a[2]}};
   const Fs=P.A.filter(a=>a[6]===1),Ws=P.A.filter(a=>a[6]!==1);
   const FB=Fs.map(a=>{const q=pl(a);return{n:q.n,p:q.p,u0:q.u-a[4]*.65,u1:q.u+a[4]*.65,y0:a[1],y1:a[1]+a[5]*1.15}});
   for(const a of Ws){const q=pl(a),y0=a[1]-.3,y1=a[1]+a[5];
     if(FB.some(f=>f.n===q.n&&Math.abs(f.p-q.p)<1.2&&Math.min(f.u1,q.u+1)-Math.max(f.u0,q.u-1)>.05&&Math.min(f.y1,y1)-Math.max(f.y0,y0)>.05)){a.rm=true;if(a.sill!==undefined)P.B[a.sill]=null}}
   P.A=P.A.filter(a=>!a.rm);P.B=P.B.filter(Boolean);
   const LVS=[PT,PT+12,PT+24];
   Fs.forEach((a,i)=>{const f=FB[i],x=a[0],y=a[1],z=a[2],ry=a[3],w=a[4],sz=Math.min(2.4,Math.max(1,w/3.5));
     let fl=-1e9,onFloor=false;
     for(const L of LVS)if(L<=y+.01&&L>fl){fl=L;onFloor=true}
     FB.forEach((g,j)=>{if(j!==i&&g.n===f.n&&Math.abs(g.p-f.p)<1.2&&Math.min(g.u1,f.u1)-Math.max(g.u0,f.u0)>.05&&g.y1<=y+.05&&g.y1>fl){fl=g.y1;onFloor=false}});
     const gap=y-fl;if(gap<.25)return;
     const nx=Math.sin(ry),nz=Math.cos(ry),tx=Math.cos(ry),tz=-Math.sin(ry),dv=.125*sz;
     const put=(u,v,y0,hh,lu,lv,col)=>P.B.push([x+nx*v+tx*u,y0+hh/2,z+nz*v+tz*u,lu,hh,lv,col,ry]);
     if(onFloor&&gap<=3.6){for(const sg of[-1,1]){put(sg*.575*w,dv,fl,gap,.15*w,.25*sz,0xeedcae);put(sg*.575*w,dv,fl,.4,.15*w+.3,.25*sz+.2,0xe9d6a6)}}   // 枠の脚を床まで伸ばし、足もとに柱脚
     else{const dp=Math.max(.5,.25*sz+.2);put(0,dp/2,y-.3,.3,1.3*w+.5,dp,0xeedcae);put(0,dp/2-.05,y-.6,.3,1.3*w-.1,dp-.1,0xcdb078)}   // 床が遠い・下に別の枠がある: 窓台と受け板で閉じる
   })}
  // ---- 見た目どおりの当たり判定（最後に1回）: 手すり・岩・胸壁・付け柱・枠・ドーム・露店の柱など、見た目の箱と円柱のすべてに、同じ形（回転した箱も）の当たり判定をつける。すでに矩形の当たり判定がある所は重ねない。上に立てる・下をくぐれる（床から1.8mより上の部分）。 ----
  {const sols=c.sols=[],CL=20,key=(i,j)=>i+','+j,RG=new Map();
   for(const q of c.rects){const lx=q.x-c.x,lz=q.z-c.z,i0=Math.floor((lx-q.w/2)/CL),i1=Math.floor((lx+q.w/2)/CL),j0=Math.floor((lz-q.d/2)/CL),j1=Math.floor((lz+q.d/2)/CL);
     if((i1-i0+1)*(j1-j0+1)>400)continue;
     for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const k=key(i,j);let l=RG.get(k);if(!l)RG.set(k,l=[]);l.push(q)}}
   const covered=(x,z,w,d,y0,y1)=>{const l=RG.get(key(Math.floor(x/CL),Math.floor(z/CL)));if(!l)return false;
     for(const q of l){if(q.top-c.h<y1-.06)continue;if(q.bot!==undefined&&q.bot-c.h>y0+.06)continue;
       if(Math.abs(q.x-c.x-x)+w/2<=q.w/2+.06&&Math.abs(q.z-c.z-z)+d/2<=q.d/2+.06)return true}return false};
   const addBox=(x,z,hu,hv,y0,y1,ry)=>sols.push({x:c.x+x,z:c.z+z,hu,hv,cs:Math.cos(ry),sn:Math.sin(ry),top:c.h+y1,bot:c.h+y0,r:Math.hypot(hu,hv)});
   const addCyl=(x,z,rad,y0,y1)=>sols.push({k:1,x:c.x+x,z:c.z+z,rad,top:c.h+y1,bot:c.h+y0,r:rad});
   for(const b of P.B){const x=b[0],yc=b[1],z=b[2],w=b[3],h=b[4],d=b[5],ry=b[7]||0;if(h<.2)continue;
     const y0=yc-h/2,y1=yc+h/2;if(!ry&&covered(x,z,w,d,y0,y1))continue;addBox(x,z,w/2,d/2,y0,y1,ry)}
   for(const q of P.Y){const h=q[4];if(h<.3)continue;addCyl(q[0],q[2],q[3],q[1]-h/2,q[1]+h/2)}                       // 円柱（ミナレット・ドラム・首・輪）
   for(const q of P.D){const x=q[0],y=q[1],z=q[2],rad=q[3],hh=rad*q[4];                                               // ドーム: 半球を3段の円柱で近似
     for(const[t0,t1,rf]of[[0,.45,.89],[.45,.8,.6],[.8,.97,.3]])addCyl(x,z,rad*rf,y+t0*hh,y+t1*hh)}
   for(const q of P.F){const x=q[0],y=q[1],z=q[2],ry=q[3],w=q[4],h=q[5],dv=.125*(q[6]||1),nx=Math.sin(ry)*dv,nz=Math.cos(ry)*dv,tx=Math.cos(ry),tz=-Math.sin(ry);   // アーチ枠: 左右の脚と上の曲がり
     for(const sg of[-1,1])addBox(x+nx+tx*sg*.575*w,z+nz+tz*sg*.575*w,.075*w,dv,y,y+.62*h,ry);
     addBox(x+nx,z+nz,.65*w,dv,y+.62*h,y+1.15*h,ry)}
   const G=c.solG=new Map(),SC=40;
   for(const b of sols){const i0=Math.floor((b.x-b.r-c.x)/SC),i1=Math.floor((b.x+b.r-c.x)/SC),j0=Math.floor((b.z-b.r-c.z)/SC),j1=Math.floor((b.z+b.r-c.z)/SC);
     for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const k=key(i,j);let l=G.get(k);if(!l)G.set(k,l=[]);l.push(b)}}}
  return c;
}
function twClear(x,z){                                            // 塔の街の敷地とそのすぐ外には木・岩を置かない
  const c=towerOfCell(Math.floor(x/TWC),Math.floor(z/TWC));
  return !!c&&Math.abs(x-c.x)<TW_R+14&&Math.abs(z-c.z)<TW_R+14;
}
function twSolsNear(tw,x,z,out){const G=tw.solG;if(!G)return;const i=Math.floor((x-tw.x)/40),j=Math.floor((z-tw.z)/40);   // 塔の街の見た目どおりの当たり判定（近くの区画だけ）
  for(let a=i-1;a<=i+1;a++)for(let b=j-1;b<=j+1;b++){const l=G.get(a+','+b);if(l)for(const s of l)out.push(s)}}
function towerNear(x,z){
  const ix=Math.floor(x/TWC),iz=Math.floor(z/TWC);
  if(ix!==_twIx||iz!==_twIz){_twIx=ix;_twIz=iz;_twC=towerOfCell(ix,iz)}
  const c=_twC;  return c&&Math.abs(x-c.x)<TW_R+60&&Math.abs(z-c.z)<TW_R+60?c:null;
}
let TW_MATS=null;
function twMats(){
  return TW_MATS||(TW_MATS={
    sand:triplanar(new THREE.MeshPhongMaterial({color:0xffffff,map:plainTex,shininess:1,specular:0x080808}),6,.7,.5),   // 砂岩（色はインスタンスごと。レンガ模様は無し）
    dome:new THREE.MeshPhongMaterial({color:0xffffff,shininess:40,specular:0x446655}),
    glass:new THREE.MeshLambertMaterial({color:0x5bbcaa,emissive:0x1b4a42}),
    arch:new THREE.MeshBasicMaterial({color:0x2c1c14})
  });
}
function addTower(g,geos,c){
  const M=twMats(),dm=new THREE.Object3D(),P=c.P,col=new THREE.Color();
  g.position.set(c.x,c.h,c.z);
  const mk=(geom,mat,n,shadow)=>{const m=new THREE.InstancedMesh(geom,mat,n);m.frustumCulled=false;m.castShadow=m.receiveShadow=!!shadow;g.add(m);return m};
  const set=(m,i,x,y,z,sx,sy,sz,ry)=>{dm.position.set(x,y,z);dm.rotation.set(0,ry||0,0);dm.scale.set(sx,sy,sz);dm.updateMatrix();m.setMatrixAt(i,dm.matrix)};
  if(P.B.length){const m=mk(boxG,M.sand,P.B.length,true);P.B.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[3],a[4],a[5],a[7]);m.setColorAt(i,col.setHex(a[6]))})}
  if(P.W.length){const m=mk(twDiscG,M.sand,P.W.length,true);P.W.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[3],a[4],a[3]);m.setColorAt(i,col.setHex(a[5]))})}
  if(P.Y.length){const m=mk(towG,M.sand,P.Y.length,true);P.Y.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[3],a[4],a[3]);m.setColorAt(i,col.setHex(a[5]))})}
  if(P.D.length){const m=mk(twDomeG,M.dome,P.D.length,true);P.D.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[3],a[3]*a[4],a[3]);m.setColorAt(i,col.setHex(a[5]))})}
  if(P.S.length){const m=mk(capG,M.dome,P.S.length,true);P.S.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[3],a[4]/2.4,a[3]);m.setColorAt(i,col.setHex(0xc9a24a))})}
  if(P.G.length){const m=mk(boxG,M.glass,P.G.length,false);P.G.forEach((a,i)=>set(m,i,a[0],a[1],a[2],a[3],a[4],a[5]))}
  if(P.A.length){const m=mk(archG,M.arch,P.A.length,false);P.A.forEach((a,i)=>set(m,i,a[0],a[1],a[2],a[4],a[5],1,a[3]))}
  if(P.F.length){const m=mk(frameG,M.sand,P.F.length,true);P.F.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[4],a[5],a[6]||1,a[3]);m.setColorAt(i,col.setHex(0xeedcae))})}
  if(P.F2.length){const m=mk(frameG2,M.sand,P.F2.length,true);P.F2.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[4],a[5],a[6]||1,a[3]);m.setColorAt(i,col.setHex(0xdcc590))})}
  if(P.F3.length){const m=mk(frameG3,M.sand,P.F3.length,true);P.F3.forEach((a,i)=>{set(m,i,a[0],a[1],a[2],a[4],a[5],a[6]||1,a[3]);m.setColorAt(i,col.setHex(0xc4a574))})}
  for(const p of P.T)addPalm(g,p[0],p[3]||0,p[1],p[2]);
}
function removeTW(g){scene.remove(g);g.traverse(o=>{if(o.isInstancedMesh)o.dispose()})}
function clearTowerCities(){for(const g of twGroups.values())removeTW(g);twGroups.clear()}
function updateTowerCities(){
  const ix=Math.floor(player.x/TWC),iz=Math.floor(player.z/TWC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,TWC,player.x,player.z,900))continue;const c=towerOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<760||(d<900&&twGroups.has(key))){keep.add(key);if(!twGroups.has(key)){const g=new THREE.Group(),geos=[];addTower(g,geos,c);g.userData.geos=geos;scene.add(g);twGroups.set(key,g)}}
  }
  for(const[k,g] of twGroups)if(!keep.has(k)){removeTW(g);twGroups.delete(k)}
}
function warpTower(){
  const list=dbgFind(TWC,towerOfCell,3,DBG_FAR);
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='塔の街: ±'+Math.round(DBG_FAR*TWC/1000)+'km以内には無い';return}
  const vis=dbgVisited.tw||(dbgVisited.tw=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));warpTo(pick.x,pick.z+TW_RW+30,0);                                         // 大階段の下(南)から塔を向く
  dbgMsg.textContent=`塔の街へ移動（${vis.size}/${list.length}か所目）`;
}

// ---------- 遊牧民の拠点（ステップ）----------
// ステップ（乾燥帯と温帯の境の草原）の平らな所に、白いゲルが4〜7張り。扉は色鮮やかな木の扉で、みな同じ向き。煙突つき。
// 少し離れて、柵で囲った家畜の囲い（中は空）。1300m四方の区画ごとに約半分。街・西洋の都市から離れた所に作る。
const NMC=1300,NM_R=66,NM_DOOR=[0xd9772b,0x2f6fb0,0xc23a2e,0x2f8f6a];
const nmCache=new Map(),nmGroups=new Map();let _nmIx=NaN,_nmIz=NaN,_nmC=null;
function nomadOfCell(ix,iz){
  const k=ix+','+iz;if(nmCache.has(k))return nmCache.get(k);
  nmCache.set(k,null);                                           // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+9091)*1e9|0);let c=null;
  if(r()<.5){
    let best=null,bs=1e9;
    for(let n=0;n<10;n++){
      const x=(ix+.2+r()*.6)*NMC,z=(iz+.2+r()*.6)*NMC;
      if(climateAt(x,z).st<.7)continue;                           // ステップのまん中で
      let ok=true;for(let i=0;i<8&&ok;i++)if(climateAt(x+Math.cos(i*.785)*110,z+Math.sin(i*.785)*110).st<.5)ok=false;
      if(!ok)continue;
      let mn=1e9,mx=-1e9,sum=0;for(let i=0;i<9;i++){const d=i?60:0,h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h}
      if(mn<WATER+3.5||mx-mn>10)continue;                          // 水辺・急な斜面は避ける
      let gap=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z;gap=Math.min(gap,Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx)))}
      if(gap<300)continue;                                       // 街から離れた所
      if(mx-mn<bs){bs=mx-mn;best={x,z,h:Math.min(30,Math.max(2.5,sum/9))}}
    }
    if(best)c=makeNomad(best,r);
  }
  nmCache.set(k,c);return c;
}
function makeNomad(b,r){
  const TAU=Math.PI*2,c={x:b.x,z:b.z,h:b.h,R:NM_R,gers:[],circs:[],yaw:r()*TAU,pen:null};
  const n=4+Math.floor(r()*4);
  for(let t=0;t<300&&c.gers.length<n;t++){                        // ゲル: 互いに6m以上あけて、ゆるくかたまる。扉の向きは同じ（少しだけばらつく）
    const a=r()*TAU,d=8+r()*34,rad=3.1+r()*1.1,lx=Math.cos(a)*d,lz=Math.sin(a)*d;
    if(c.gers.some(q=>Math.hypot(q.x-lx,q.z-lz)<q.r+rad+6))continue;
    c.gers.push({x:lx,z:lz,r:rad,yaw:c.yaw+(r()-.5)*.5,dc:Math.floor(r()*NM_DOOR.length)});
  }
  const PR=7+r()*3;
  for(let t=0;t<300&&!c.pen;t++){                                 // 囲い（ゲルから離れた所）
    const a=r()*TAU,d=26+r()*30,lx=Math.cos(a)*d,lz=Math.sin(a)*d;
    if(c.gers.every(q=>Math.hypot(q.x-lx,q.z-lz)>q.r+PR+4))c.pen={x:lx,z:lz,R:PR}
  }
  if(!c.pen){const a=r()*TAU;c.pen={x:Math.cos(a)*(NM_R-8),z:Math.sin(a)*(NM_R-8),R:PR}}
  const P=c.pen;P.face=Math.atan2(-P.z,-P.x);                    // 囲いの出入り口は拠点の中心側
  for(const q of c.gers)c.circs.push([c.x+q.x,c.z+q.z,q.r+.4]);
  P.posts=[];const np=Math.max(16,Math.round(TAU*P.R/1.7));
  for(let i=0;i<np;i++){const a=i/np*TAU,da=Math.atan2(Math.sin(a-P.face),Math.cos(a-P.face));
    P.posts.push({x:P.x+Math.cos(a)*P.R,z:P.z+Math.sin(a)*P.R,a,gap:Math.abs(da)<.3});
    if(Math.abs(da)>=.3)c.circs.push([c.x+P.x+Math.cos(a)*P.R,c.z+P.z+Math.sin(a)*P.R,.5])}
  return c;
}
function nomadNear(x,z){
  const ix=Math.floor(x/NMC),iz=Math.floor(z/NMC);
  if(ix!==_nmIx||iz!==_nmIz){_nmIx=ix;_nmIz=iz;_nmC=nomadOfCell(ix,iz)}
  const c=_nmC;return c&&Math.hypot(x-c.x,z-c.z)<c.R+40?c:null;
}
function nomadClear(x,z){const c=nomadOfCell(Math.floor(x/NMC),Math.floor(z/NMC));return !!c&&Math.hypot(x-c.x,z-c.z)<c.R}   // 木・岩を置かない範囲
function nomadGround(c,x,z){                                      // 地面の色: ゲルのまわりと囲いの中は踏み固められた土
  const lx=x-c.x,lz=z-c.z;let md=1e9;for(const q of c.gers){const d=Math.hypot(lx-q.x,lz-q.z)-q.r;if(d<md)md=d}
  const dp=Math.hypot(lx-c.pen.x,lz-c.pen.z)-c.pen.R;
  if(md<1.2||dp<0)return[.47,.4,.27];
  if(md<4.5||dp<2)return[.55,.5,.31];
  return null;
}
let NM_MATS=null,nmCylG=null,nmConeG=null;
function addNomad(g,geos,c){
  if(!NM_MATS)NM_MATS={felt:new THREE.MeshLambertMaterial({color:0xf2efe6}),col:new THREE.MeshLambertMaterial({color:0xffffff})};
  if(!nmCylG){nmCylG=new THREE.CylinderGeometry(1,1,1,18);nmConeG=new THREE.ConeGeometry(1,1,18)}
  const dm=new THREE.Object3D(),col=new THREE.Color();g.position.set(c.x,c.h,c.z);
  const inst=(geom,mat,list)=>{if(!list.length)return;const m=new THREE.InstancedMesh(geom,mat,list.length);
    list.forEach((o,i)=>{dm.position.set(o.x,o.y,o.z);dm.rotation.set(0,o.ry||0,o.rz||0);dm.scale.set(o.sx,o.sy,o.sz);dm.updateMatrix();m.setMatrixAt(i,dm.matrix);if(o.col!==undefined)m.setColorAt(i,col.setHex(o.col))});
    m.frustumCulled=false;m.castShadow=m.receiveShadow=true;g.add(m)};
  const walls=[],roofs=[],bands=[],crowns=[],pipes=[],frames=[],panels=[],pats=[];
  for(const q of c.gers){
    const r=q.r,wh=1.55*(r/3.5)+.1,rh=r*.5,sy=Math.sin(q.yaw),cy=Math.cos(q.yaw);
    walls.push({x:q.x,y:wh/2,z:q.z,sx:r,sy:wh,sz:r});
    roofs.push({x:q.x,y:wh+rh/2-.02,z:q.z,sx:r*1.1,sy:rh,sz:r*1.1});                                   // 屋根（ゆるい円錐）
    for(const y of[.55,wh*.93])bands.push({x:q.x,y,z:q.z,sx:r*1.015,sy:.11,sz:r*1.015,col:0x9b8f78});     // 壁をまわる縄の帯
    crowns.push({x:q.x,y:wh+rh+.02,z:q.z,sx:r*.2,sy:.3,sz:r*.2,col:0x7a5230});                          // 天窓（トーノ）
    pipes.push({x:q.x+cy*r*.14,y:wh+rh+.6,z:q.z-sy*r*.14,sx:.09,sy:1.5,sz:.09,col:0x2b2b2b});          // 煙突
    const dx=q.x+sy*(r+.03),dz=q.z+cy*(r+.03);                                                          // 扉（外向き＝局所+z）
    frames.push({x:dx-sy*.03,y:.9,z:dz-cy*.03,ry:q.yaw,sx:1.4,sy:1.8,sz:.1,col:0x7a5230});
    panels.push({x:dx,y:.85,z:dz,ry:q.yaw,sx:1.1,sy:1.5,sz:.1,col:NM_DOOR[q.dc]});
    pats.push({x:dx+sy*.07,y:.9,z:dz+cy*.07,ry:q.yaw,rz:Math.PI/4,sx:.5,sy:.5,sz:.05,col:0xf2c14e});     // 扉の菱形の飾り
  }
  inst(nmCylG,NM_MATS.felt,walls);inst(nmConeG,NM_MATS.felt,roofs);
  inst(nmCylG,NM_MATS.col,bands.concat(crowns,pipes));
  inst(boxG,NM_MATS.col,frames.concat(panels,pats));
  const P=c.pen,fp=[],fr=[],np=P.posts.length;                                                         // 囲い: 杭と2段の横木
  for(let i=0;i<np;i++){const a=P.posts[i],b=P.posts[(i+1)%np];if(a.gap)continue;
    fp.push({x:a.x,y:.5,z:a.z,sx:.16,sy:1,sz:.16,col:0x7a5a38});
    if(!b.gap){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),ry=Math.atan2(-dz,dx);for(const y of[.4,.8])fr.push({x:(a.x+b.x)/2,y,z:(a.z+b.z)/2,ry,sx:len,sy:.07,sz:.07,col:0x8a6a45})}}
  inst(boxG,NM_MATS.col,fp.concat(fr));
}
function clearNomads(){for(const g of nmGroups.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}nmGroups.clear()}
function updateNomads(){
  const ix=Math.floor(player.x/NMC),iz=Math.floor(player.z/NMC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,NMC,player.x,player.z,460))continue;const c=nomadOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<330||(d<420&&nmGroups.has(key))){keep.add(key);if(!nmGroups.has(key)){const g=new THREE.Group(),geos=[];addNomad(g,geos,c);g.userData.geos=geos;scene.add(g);nmGroups.set(key,g)}}
  }
  for(const[k,g] of nmGroups)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());nmGroups.delete(k)}
}
function warpNomad(){
  const list=dbgFind(NMC,nomadOfCell,3,DBG_FAR);
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='遊牧民の拠点: ±'+Math.round(DBG_FAR*NMC/1000)+'km以内には無い';return}
  const vis=dbgVisited.nm||(dbgVisited.nm=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));warpTo(pick.x,pick.z-NM_R+4,yawTo(0,1));                                         // 南寄りから拠点を向く
  dbgMsg.textContent=`遊牧民の拠点へ移動（${vis.size}/${list.length}か所目）`;
}

// ---------- 軍営（特定の街に結びついた木柵の陣地）----------
// 街・村から離れた平らな所（街の端から260〜1100m）に、四隅に物見櫓のある木柵の陣地を作る。1000m四方の区画ごとに約半分。
// 柵の門は結びついた街のほうを向く。中には天幕・指揮所の大天幕・机・樽や木箱・焚き火・丸太の倉庫、門の外には逆茂木。
// 結びつき: 各軍営は c.link={kind:'town'|'west', x,z, key, dist} を持つ。town=結びついた砂漠の王国の中心座標・街の端からの距離。west=王国に結びつかない西洋の軍営（x,zは門の向きを決めるだけの仮の点）。
//   campsOfTown(x,z) で、ある街（中心座標）に結びついた軍営の一覧を取れる。旗の色は街ごとに決まる（同じ街の軍営は同じ色）。
const cpCache=new Map(),cpGroups=new Map();let _cpIx=NaN,_cpIz=NaN,_cpC=null;
function campParent(x,z){                                         // いちばん近い「城のある街」（砂漠の王国=宮殿と城壁を持つ街）と、その街の端からの距離。城のない街（砂漠の共和国・併設の市場都市）や西洋の都市には属さない
  let best=null;
  for(const t of nearTowns(x,z)){if(t.kind==='city')continue;const dx=x-t.x,dz=z-t.z,gap=Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx));if(!best||gap<best.gap)best={kind:'town',x:t.x,z:t.z,gap}}
  return best;
}
function campOfCell(ix,iz){
  const k=ix+','+iz;if(cpCache.has(k))return cpCache.get(k);
  cpCache.set(k,null);                                           // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+9393)*1e9|0);let c=null;
  const u=r();                                                   // 区画の抽選: u<.55 は砂漠の王国に結びつく軍営の候補、u<.1 は結びつかない西洋の軍営の候補（砂漠以外の平らな所）
  if(u<.55){
    let best=null,bs=1e9;
    for(let n=0;n<12;n++){
      const x=(ix+.2+r()*.6)*MCC,z=(iz+.2+r()*.6)*MCC;
      let mn=1e9,mx=-1e9,sum=0;for(let i=0;i<9;i++){const d=i?CAMP_R:0,h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h}
      if(mn<WATER+3.5||mx-mn>9||mx>120)continue;                   // 水辺・急な斜面・高すぎる所は避ける
      let par=campParent(x,z);
      if(par&&par.gap<260)continue;                                // 王国に近すぎる所には置かない
      if(!par||par.gap>1100){                                      // 砂漠の王国に結びつかない軍営 = 西洋の軍営（砂漠以外。向きはランダム）
        if(u>=.1||climateAt(x,z).de>=.35)continue;
        const ang=r()*Math.PI*2;par={kind:'west',x:x+Math.cos(ang)*500,z:z+Math.sin(ang)*500,gap:0};
      }
      let ok=true;
      for(let i=0;i<5&&ok;i++){const d=i?CAMP_R+10:0,xx=x+Math.cos(i*1.571)*d,zz=z+Math.sin(i*1.571)*d;
        if(villageDist(xx,zz)<150||riverEff(xx,zz)<30||(caravanClear(xx,zz)||twClear(xx,zz))||nomadClear(xx,zz)||tribeClear(xx,zz)||rgClear(xx,zz))ok=false}
      if(!ok)continue;
      if(mx-mn<bs){bs=mx-mn;best={x,z,h:Math.min(40,Math.max(3,sum/9)),par}}
    }
    if(best)c=makeCamp(best,r);
  }
  cpCache.set(k,c);return c;
}
function makeCamp(b,r){
  const p=b.par,hx=38+r()*8,hz=30+r()*6,yaw=Math.atan2(p.x-b.x,p.z-b.z),sy=Math.sin(yaw),cy=Math.cos(yaw);   // 局所+zが結びついた街の向き（門の側）
  const c={x:b.x,z:b.z,h:b.h,R:CAMP_R,hx,hz,yaw,sy,cy,circs:[],
    link:{kind:p.kind,x:p.x,z:p.z,key:p.kind+':'+Math.round(p.x)+','+Math.round(p.z),dist:Math.round(p.gap)},
    col:CAMP_COL[Math.floor(hash(Math.round(p.x),Math.round(p.z),SEED+77)*CAMP_COL.length)%CAMP_COL.length]};
  const I=c.inst={box:[],cyl:[],cone:[],pyr:[],tent:[],stk:[],tip:[]};
  const cw=(lx,lz)=>[c.x+lx*cy+lz*sy,c.z-lx*sy+lz*cy];            // 局所→ワールド
  const circ=(lx,lz,rad)=>{const w=cw(lx,lz);c.circs.push([w[0],w[1],rad])};
  const bx=(x,y,z,sx,sy2,sz,col,ry,rz)=>I.box.push({x,y,z,sx,sy:sy2,sz,col,ry,rz});
  const cl=(x,y,z,rad,h,col)=>I.cyl.push({x,y,z,sx:rad,sy:h,sz:rad,col});
  const WOOD=[0x6b5a46,0x77654f,0x5f5040],DK=0x4a3524,PL=0x6a5640;
  // 木柵（先を尖らせた丸太）。門（南=局所+z、幅7.2m）だけ開ける
  const stake=(x,z,i)=>{const h=3.4+(r()-.5)*.8,col=WOOD[i%3];I.stk.push({x,y:h/2,z,sx:.2,sy:h,sz:.2,col});I.tip.push({x,y:h+.3,z,sx:.2,sy:.6,sz:.2,col:0xb89a70})};
  let si=0;
  for(let x=-hx;x<=hx+.01;x+=.6){stake(x,-hz,si++);if(Math.abs(x)>3.6)stake(x,hz,si++)}
  for(let z=-hz+.6;z<hz-.01;z+=.6){stake(-hx,z,si++);stake(hx,z,si++)}
  for(let x=-hx;x<hx;x+=1.2){circ(x,-hz,.85);if(Math.abs(x)>4.6)circ(x,hz,.85)}
  for(let z=-hz;z<hz;z+=1.2){circ(-hx,z,.85);circ(hx,z,.85)}
  for(const y of[1.1,2.3]){bx(0,y,-hz+.25,2*hx,.16,.16,DK);bx(-hx+.25,y,0,.16,.16,2*hz,DK);bx(hx-.25,y,0,.16,.16,2*hz,DK);
    bx(-(3.6+(hx-3.6)/2),y,hz-.25,hx-3.6,.16,.16,DK);bx(3.6+(hx-3.6)/2,y,hz-.25,hx-3.6,.16,.16,DK)}
  // 門（板の門柱・門楼・開いた扉・旗）
  bx(0,5.6,hz,8.4,.9,1.2,DK);bx(0,6.2,hz,14,.3,2.6,PL);
  for(const s of[-1,1]){
    bx(s*3.6,3.2,hz,.9,6.4,.9,DK);bx(s*5.2,2.9,hz,3.2,5.8,2.2,0x6a5640);bx(s*5.2,6.1,hz,3.4,.5,2.4,DK);
    bx(s*3.3,2.1,hz-1.7,.22,4.2,3.2,0x7a5a38);
    bx(s*5.2,3.6,hz+1.15,1.4,3.6,.08,c.col);bx(s*5.2,4.0,hz+1.2,.5,.6,.04,0xe0b13a);
    circ(s*5.2,hz,2.2);
  }
  // 四隅の物見櫓（木組みの格子・張り出した床・屋根・旗）
  const Ht=9;
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const tx=sx*(hx-3.5),tz=sz*(hz-3.5);
    for(const a of[-1,1])for(const bb of[-1,1])bx(tx+a*1.5,Ht/2,tz+bb*1.5,.5,Ht,.5,0x4a3a2a);
    for(const y of[2.8,5.8,8.8])for(const a of[-1,1]){bx(tx,y,tz+a*1.5,3.5,.28,.28,DK);bx(tx+a*1.5,y,tz,.28,.28,3.5,DK)}
    const ys=[0,2.8,5.8,8.8];
    for(let k=0;k<3;k++){const mid=(ys[k]+ys[k+1])/2,dy=ys[k+1]-ys[k],Lg=Math.hypot(3,dy),ang=Math.atan2(dy,3);
      for(const a of[-1,1]){bx(tx,mid,tz+a*1.5,Lg,.22,.22,DK,0,(k%2?-1:1)*ang);bx(tx+a*1.5,mid,tz,Lg,.22,.22,DK,Math.PI/2,(k%2?1:-1)*ang)}}
    bx(tx,Ht+.1,tz,4.4,.35,4.4,PL);
    for(const a of[-1,1]){bx(tx,Ht+.8,tz+a*2.1,4.4,1,.15,0x7a6448);bx(tx+a*2.1,Ht+.8,tz,.15,1,4.4,0x7a6448)}
    for(const a of[-1,1])for(const bb of[-1,1])bx(tx+a*2,Ht+1.5,tz+bb*2,.2,2.8,.2,DK);
    I.pyr.push({x:tx,y:Ht+2.9+.9,z:tz,sx:3.6,sy:1.8,sz:3.6,ry:Math.PI/4,col:0x5a4632});
    bx(tx,6.6,tz+sz*1.75,1.3,3.4,.08,c.col);bx(tx,7.0,tz+sz*1.8,.5,.6,.04,0xe0b13a);
    circ(tx,tz,2.2);
  }
  // 天幕（A字型）。幕の色は結びついた街の色
  const tent=(x,z,ry,col)=>{I.tent.push({x,y:0,z,sx:3.8,sy:2.3,sz:3.1,ry,col});circ(x,z,2)};
  for(let i=0;i<3;i++)for(let j=0;j<2;j++)tent(-hx+9+i*6.2,hz*.15+j*5.4,0,c.col);
  for(let i=0;i<5;i++)tent(hx*.25+i*5.6,-hz*.05,Math.PI/2,c.col);
  for(let i=0;i<3;i++)tent(-18+i*4.8,-hz+8,0,0xe8e1c8);
  // 指揮所の大天幕（白い円形・旗）
  {const z=-hz*.45;cl(0,1.2,z,4.3,2.4,0xf0ece0);I.cone.push({x:0,y:2.4+1.7,z,sx:4.9,sy:3.4,sz:4.9,col:0xf0ece0});
   cl(0,6.4,z,.08,2.4,DK);bx(.5,7.3,z,1,.55,.05,c.col);circ(0,z,4.5)}
  // 机（暗い色の長机）
  for(let i=0;i<4;i++)for(let j=0;j<2;j++){bx(-12+i*3.4,.43,-hz*.2+j*3,2.6,.86,.7,0x2b2420);circ(-12+i*3.4,-hz*.2+j*3,.9)}
  // 樽・木箱（壁ぎわにばらまく）
  for(let i=0;i<10;i++){const sd=r()<.5?-1:1,x=sd*(hx-1.6),z=-hz+3+r()*(2*hz-6);if(r()<.5)cl(x,.475,z,.42,.95,0x6b4a2a);else bx(x,.425,z,.85,.85,.85,0x8a6a45,r()*3)}
  // 焚き火・丸太の倉庫
  cl(6,.12,8,.9,.25,0x55524c);bx(6,.3,8,.9,.14,.14,0x3a2a1c,.6);bx(6,.3,8,.9,.14,.14,0x3a2a1c,-.6);
  bx(hx-8,1.8,hz-9,8,3.6,5.6,0x6b5238);I.tent.push({x:hx-8,y:3.6,z:hz-9,sx:8.8,sy:1.8,sz:6.4,ry:0,col:0x4a3a2a});circ(hx-8,hz-9,4.6);
  // 門の外の逆茂木（先を尖らせた丸太を組んだ障害物）
  for(let i=0;i<5;i++){const s=r()<.5?-1:1,x=s*(7+r()*9),z=hz+6+r()*14,a=r()*3;
    bx(x,.85,z,1.9,.14,.14,0x5a4632,a);bx(x,.85,z,.14,1.9,.14,0x5a4632);bx(x,.85,z,1.9,.14,.14,0x5a4632,a+1.6);circ(x,z,.9)}
  return c;
}
function campNear(x,z){
  const ix=Math.floor(x/MCC),iz=Math.floor(z/MCC);
  if(ix!==_cpIx||iz!==_cpIz){const c=campOfCell(ix,iz);_cpIx=ix;_cpIz=iz;_cpC=c}   // 先に作ってから記録（作る途中の再入で食い違わないように）
  const c=_cpC;return c&&Math.hypot(x-c.x,z-c.z)<c.R+40?c:null;
}
function campClear(x,z){                                          // 木・岩を置かない範囲: 柵の内側とそのまわり7m、門から出る道
  const c=campOfCell(Math.floor(x/MCC),Math.floor(z/MCC));if(!c)return false;
  const dx=x-c.x,dz=z-c.z;if(dx*dx+dz*dz>c.R*c.R)return false;
  const lx=dx*c.cy-dz*c.sy,lz=dx*c.sy+dz*c.cy;
  return (Math.abs(lx)<c.hx+7&&Math.abs(lz)<c.hz+7)||(Math.abs(lx)<5&&lz>0&&lz<c.hz+32);
}
function campGround(c,x,z){                                       // 地面の色: 柵の中は踏み固めた土、門から道
  const dx=x-c.x,dz=z-c.z,lx=dx*c.cy-dz*c.sy,lz=dx*c.sy+dz*c.cy,ex=Math.max(Math.abs(lx)-c.hx,Math.abs(lz)-c.hz);
  if(ex<0)return[.45,.37,.25];
  if(ex<5)return[.52,.45,.3];
  if(lz>c.hz&&Math.abs(lx)<3.8&&lz<c.hz+40)return[.5,.43,.29];
  return null;
}
function campsOfTown(tx,tz){                                      // この街（中心座標）に結びついた軍営の一覧
  const out=[],i0=Math.floor(tx/MCC),j0=Math.floor(tz/MCC);
  for(let i=i0-2;i<=i0+2;i++)for(let j=j0-2;j<=j0+2;j++){const c=campOfCell(i,j);if(c&&Math.abs(c.link.x-tx)<1&&Math.abs(c.link.z-tz)<1)out.push(c)}
  return out;
}
let CP_M=null,cpGeo=null;
function addCamp(g,geos,c){
  if(!CP_M)CP_M=new THREE.MeshLambertMaterial({color:0xffffff});
  if(!cpGeo){
    const tp=new THREE.BufferGeometry(),v=[-.5,0,.5,.5,0,.5,.5,1,0, -.5,0,.5,.5,1,0,-.5,1,0, .5,0,-.5,-.5,0,-.5,-.5,1,0, .5,0,-.5,-.5,1,0,.5,1,0, .5,0,.5,.5,0,-.5,.5,1,0, -.5,0,-.5,-.5,0,.5,-.5,1,0];   // A字の天幕（尾根はx方向）
    tp.setAttribute('position',new THREE.Float32BufferAttribute(v,3));tp.computeVertexNormals();
    cpGeo={tent:tp,cyl6:new THREE.CylinderGeometry(1,1,1,6),cone6:new THREE.ConeGeometry(1,1,6),cyl:new THREE.CylinderGeometry(1,1,1,14),cone:new THREE.ConeGeometry(1,1,14),pyr:new THREE.ConeGeometry(1,1,4)};
  }
  const dm=new THREE.Object3D(),col=new THREE.Color();g.position.set(c.x,c.h,c.z);g.rotation.y=c.yaw;
  const inst=(geom,list)=>{if(!list.length)return;const m=new THREE.InstancedMesh(geom,CP_M,list.length);
    list.forEach((o,i)=>{dm.position.set(o.x,o.y,o.z);dm.rotation.set(0,o.ry||0,o.rz||0);dm.scale.set(o.sx,o.sy,o.sz);dm.updateMatrix();m.setMatrixAt(i,dm.matrix);m.setColorAt(i,col.setHex(o.col))});
    m.frustumCulled=false;m.castShadow=m.receiveShadow=true;g.add(m)};
  const I=c.inst;
  inst(boxG,I.box);inst(cpGeo.cyl6,I.stk);inst(cpGeo.cone6,I.tip);inst(cpGeo.cyl,I.cyl);inst(cpGeo.cone,I.cone);inst(cpGeo.pyr,I.pyr);inst(cpGeo.tent,I.tent);
}
function clearCamps(){for(const g of cpGroups.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}cpGroups.clear()}
function updateCamps(){
  const ix=Math.floor(player.x/MCC),iz=Math.floor(player.z/MCC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,MCC,player.x,player.z,460))continue;const c=campOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<360||(d<460&&cpGroups.has(key))){keep.add(key);if(!cpGroups.has(key)){const g=new THREE.Group(),geos=[];addCamp(g,geos,c);g.userData.geos=geos;scene.add(g);cpGroups.set(key,g)}}
  }
  for(const[k,g] of cpGroups)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());cpGroups.delete(k)}
}
function warpCamp(){
  const list=dbgFind(MCC,campOfCell,3,DBG_FAR);
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='軍営: ±'+Math.round(DBG_FAR*MCC/1000)+'km以内には無い';return}
  const vis=dbgVisited.cp||(dbgVisited.cp=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));warpTo(pick.x+pick.sy*(pick.hz+22),pick.z+pick.cy*(pick.hz+22),yawTo(-pick.sy,-pick.cy));   // 門の前から軍営を向く
  dbgMsg.textContent=`軍営へ移動（${vis.size}/${list.length}か所目）結びついた街: ${pick.link.kind==='west'?'なし（西洋の軍営）':'砂漠の王国'}（街の端から約${pick.link.dist}m）`;
}

// ---------- 部族の村（ジャングル・山）----------
// ジャングルの中、または山の中腹に、草葺きの大屋根と板壁の高床の家が4〜7軒。広場（焚き火）のまわりに、家の正面を広場へ向けて並べ、ヤシの木を添える。
// 地形は平らにならさず、木も残す: 家は斜面の小さい所だけに建て、高床の柱を地面まで伸ばし（斜面側は長く）、階段で地面へ下りる。木・岩を避けるのは家・広場・ヤシのすぐまわりだけ。
// 家は大きな長家と小さな家が混ざる。階段つきの小さなポーチ、暗い窓。1100m四方の区画ごとに約半分。街・西洋の都市から離れた所に作る。
const tbCache=new Map(),tbGroups=new Map();let _tbIx=NaN,_tbIz=NaN,_tbC=null;
function tribeOfCell(ix,iz){
  const k=ix+','+iz;if(tbCache.has(k))return tbCache.get(k);
  tbCache.set(k,null);                                           // 作っている最中に再入しても無限ループしないよう先に仮置き
  const r=mulberry(hash(ix,iz,SEED+9191)*1e9|0);let c=null;
  if(r()<.5){
    let best=null,bs=1e9;
    for(let n=0;n<12;n++){
      const x=(ix+.2+r()*.6)*TVC,z=(iz+.2+r()*.6)*TVC;
      let kind=null;
      if(climateAt(x,z).jg>.7){kind='jungle';for(let i=0;i<8&&kind;i++)if(climateAt(x+Math.cos(i*.785)*100,z+Math.sin(i*.785)*100).jg<.5)kind=null}   // ジャングルのまん中で
      else{const hb=mtBump(x,z)+rangeBump(x,z);if(hb>45&&hb<120)kind='mountain'}                                                                   // 山の中腹（森林限界より下）
      if(!kind)continue;
      let mn=1e9,mx=-1e9;for(let i=0;i<9;i++){const d=i?50:0,h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);mn=Math.min(mn,h);mx=Math.max(mx,h)}
      if(mn<WATER+3.5||mx-mn>(kind==='jungle'?14:34))continue;      // 水辺・急すぎる斜面は避ける（家は斜面の小さい所だけに建てる）
      let gap=1e9;for(const t of nearTowns(x,z)){const dx=x-t.x,dz=z-t.z;gap=Math.min(gap,Math.hypot(dx,dz)-townEdge(t,Math.atan2(dz,dx)))}
      if(gap<300)continue;
      if(mx-mn<bs){bs=mx-mn;best={x,z,kind}}
    }
    if(best)c=makeTribe(best,r);
  }
  tbCache.set(k,c);return c;
}
function makeTribe(b,r){
  const TAU=Math.PI*2,h0=heightAt(b.x,b.z);if(h0<WATER+2)return null;
  const c={x:b.x,z:b.z,h:h0,kind:b.kind,R:TB_R,houses:[],circs:[],palms:[]};      // c.h=広場の地面の高さ。以降のyはここからの高さ
  const n=4+Math.floor(r()*4);
  for(let t=0;t<700&&c.houses.length<n;t++){                      // 家: 広場(中心から8m以内)をあけ、互いに離して、正面を広場へ向ける。斜面の小さい所だけ
    const big=c.houses.length===0||r()<.3,w=big?10+r()*2.5:5.5+r()*1.5,d=big?6.5+r():4.5+r();
    const a=r()*TAU,dist=14+r()*22,lx=Math.cos(a)*dist,lz=Math.sin(a)*dist,rr=Math.max(w,d)/2+3.5;
    if(c.houses.some(q=>Math.hypot(q.x-lx,q.z-lz)<q.rr+rr))continue;
    const yaw=Math.atan2(-lx,-lz)+(r()-.5)*.5,cy=Math.cos(yaw),sy=Math.sin(yaw),dx=(r()<.5?-1:1)*.2;
    const G=(u,v)=>heightAt(c.x+lx+u*cy+v*sy,c.z+lz-u*sy+v*cy)-c.h;                             // 家の局所(u=横,v=正面)の地面の高さ
    const px=w/2-.25,pz=d/2-.25,posts=[];for(const u of(w>8?[-px,0,px]:[-px,px]))for(const v of[-pz,pz])posts.push({u,v,gy:G(u,v)});
    let mn=1e9,mx=-1e9;for(const q of posts){mn=Math.min(mn,q.gy);mx=Math.max(mx,q.gy)}
    if(mx-mn>3.2||mn+c.h<WATER+1.5)continue;                       // 柱で支えられる斜面まで
    const gyF=G(dx*w,d/2+2.2);if(gyF+c.h<WATER+1)continue;
    c.houses.push({x:lx,z:lz,w,d,rr,yaw,wc:[0x7d6a52,0x8a7658,0x6f604a][Math.floor(r()*3)],tc:[0x8b7b5a,0x7d6e50,0x94845f][Math.floor(r()*3)],dx,fy:mx+.9,posts,gyF});
  }
  if(c.houses.length<3)return null;
  for(const h of c.houses){const sy=Math.sin(h.yaw),cy=Math.cos(h.yaw),m=Math.max(1,Math.round(h.w/(h.d*.8))),rad=h.d/2+.3;   // 当たり判定: 長辺に沿って円を並べる
    for(let i=0;i<m;i++){const u=(m===1?0:(i/(m-1)-.5)*(h.w-h.d));c.circs.push([c.x+h.x+u*cy,c.z+h.z-u*sy,rad])}}
  const np=3+Math.floor(r()*4);
  for(let t=0;t<200&&c.palms.length<np;t++){
    const a=r()*TAU,dist=12+r()*38,lx=Math.cos(a)*dist,lz=Math.sin(a)*dist;
    if(c.houses.some(q=>Math.hypot(q.x-lx,q.z-lz)<q.rr+1))continue;
    const hh=heightAt(c.x+lx,c.z+lz);if(hh<WATER+1.5)continue;
    c.palms.push({x:lx,z:lz,y:hh-c.h,s:.9+r()*.45});c.circs.push([c.x+lx,c.z+lz,.5]);
  }
  return c;
}
function tribeNear(x,z){
  const ix=Math.floor(x/TVC),iz=Math.floor(z/TVC);
  if(ix!==_tbIx||iz!==_tbIz){_tbIx=ix;_tbIz=iz;_tbC=tribeOfCell(ix,iz)}
  const c=_tbC;return c&&Math.hypot(x-c.x,z-c.z)<c.R+40?c:null;
}
function tribeClear(x,z){                                         // 木・岩を置かない範囲: 広場・家・ヤシのすぐまわりだけ（ほかの木は残す）
  const c=tribeOfCell(Math.floor(x/TVC),Math.floor(z/TVC));if(!c)return false;
  const lx=x-c.x,lz=z-c.z;if(Math.hypot(lx,lz)>c.R)return false;
  if(Math.hypot(lx,lz)<6)return true;
  for(const h of c.houses)if(Math.hypot(lx-h.x,lz-h.z)<Math.max(h.w,h.d)/2+3)return true;
  for(const p of c.palms)if(Math.hypot(lx-p.x,lz-p.z)<1.6)return true;
  return false;
}
function tribeGround(c,x,z){                                      // 地面の色: 広場と家のまわりだけ踏み固められた土
  const lx=x-c.x,lz=z-c.z;
  if(Math.hypot(lx,lz)<5)return[.5,.43,.29];
  for(const h of c.houses)if(Math.hypot(lx-h.x,lz-h.z)<Math.max(h.w,h.d)/2+2)return[.48,.41,.28];
  return null;
}
let TB_MATS=null,tbRoofG=null;
function addTribe(g,geos,c){
  if(!TB_MATS)TB_MATS={col:new THREE.MeshLambertMaterial({color:0xffffff}),thatch:new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide})};
  if(!tbRoofG){const rl=.55,v=[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-rl,1,0],[rl,1,0]],q=[3,2,5,3,5,4,1,0,4,1,4,5,2,1,5,0,3,4],a=[];   // 寄棟の屋根（長い棟と、傾いた妻側）
    for(const i of q)a.push(v[i][0],v[i][1],v[i][2]);tbRoofG=new THREE.BufferGeometry();tbRoofG.setAttribute('position',new THREE.Float32BufferAttribute(a,3));tbRoofG.computeVertexNormals()}
  const dm=new THREE.Object3D(),col=new THREE.Color();g.position.set(c.x,c.h,c.z);
  const inst=(geom,mat,list)=>{if(!list.length)return;const m=new THREE.InstancedMesh(geom,mat,list.length);
    list.forEach((o,i)=>{dm.position.set(o.x,o.y,o.z);dm.rotation.set(0,o.ry||0,0);dm.scale.set(o.sx,o.sy,o.sz);dm.updateMatrix();m.setMatrixAt(i,dm.matrix);m.setColorAt(i,col.setHex(o.col))});
    m.frustumCulled=false;m.castShadow=m.receiveShadow=true;g.add(m)};
  const boxes=[],roofs=[],WH=2.5;
  for(const h of c.houses){
    const cy=Math.cos(h.yaw),sy=Math.sin(h.yaw),w=h.w,d=h.d,ry=h.yaw,FL=h.fy;
    const P=(lx,lz,y,sx,sy2,sz,color)=>boxes.push({x:h.x+lx*cy+lz*sy,y,z:h.z-lx*sy+lz*cy,ry,sx,sy:sy2,sz,col:color});   // 家の局所座標(+z=正面)の箱
    P(0,0,FL,w+.4,.2,d+.4,0x6a5640);                                                              // 床
    for(const q of h.posts){const len=Math.max(.5,FL-q.gy)+.2;P(q.u,q.v,FL-len/2+.1,.28,len,.28,0x5a4632)}   // 高床の柱（地面まで。斜面の低い側は長い）
    P(0,0,FL+.1+WH/2,w,WH,d,h.wc);                                                                // 板壁
    roofs.push({x:h.x,y:FL+.1+WH-.15,z:h.z,ry,sx:w/2+1.1,sy:d*.65+1,sz:d/2+1.1,col:h.tc});          // 草葺きの大屋根
    const dx=h.dx*w;P(dx,d/2+.04,FL+1.15,1.0,1.9,.08,0x3b2a1b);                                    // 入口
    P(-dx*.9,d/2+.03,FL+1.75,.7,.75,.06,0x1e1710);P(dx>0?-w*.38:w*.38,-d/2-.03,FL+1.75,.7,.75,.06,0x1e1710);   // 窓（前・後）
    if(w>8){P(w/2+.03,0,FL+1.75,.06,.75,.7,0x1e1710);P(-w/2-.03,0,FL+1.75,.06,.75,.7,0x1e1710)}
    P(dx,d/2+.65,FL+.07,1.8,.14,1.2,0x6a5640);                                                     // ポーチ
    const drop=Math.max(.3,FL-h.gyF),ns=Math.min(10,Math.max(2,Math.ceil(drop/.45)));              // 階段: 地面の高さまで段を下ろす
    for(let k=1;k<=ns;k++)P(dx,d/2+1.25+.28+(k-1)*.55,FL+.07-drop*k/ns,1.2,.14,.55,0x6a5640);
  }
  inst(boxG,TB_MATS.col,boxes);inst(tbRoofG,TB_MATS.thatch,roofs);
  {const st=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;st.push({x:Math.cos(a)*.95,y:.12,z:Math.sin(a)*.95,sx:.24,sy:.22,sz:.24,col:0x8a857c})}     // 広場の焚き火（石の輪と灰）。c.h=広場の地面
   st.push({x:0,y:.04,z:0,sx:.8,sy:.08,sz:.8,col:0x2b2622});inst(ballG,TB_MATS.col,st.slice(0,8));inst(towG,TB_MATS.col,[st[8]])}
  for(const p of c.palms)addPalm(g,p.x,p.y,p.z,p.s);                                              // ヤシの木
}
function clearTribes(){for(const g of tbGroups.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}tbGroups.clear()}
function updateTribes(){
  const ix=Math.floor(player.x/TVC),iz=Math.floor(player.z/TVC),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    if(!rectNear(ix+a,iz+b,TVC,player.x,player.z,460))continue;const c=tribeOfCell(ix+a,iz+b);if(!c)continue;
    const key=c.x+','+c.z,d=Math.hypot(c.x-player.x,c.z-player.z);
    if(d<330||(d<420&&tbGroups.has(key))){keep.add(key);if(!tbGroups.has(key)){const g=new THREE.Group(),geos=[];addTribe(g,geos,c);g.userData.geos=geos;scene.add(g);tbGroups.set(key,g)}}
  }
  for(const[k,g] of tbGroups)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());tbGroups.delete(k)}
}
function warpTribe(){
  const list=dbgFind(TVC,tribeOfCell,3,DBG_FAR);
  list.sort((p,q)=>Math.hypot(p.x-player.x,p.z-player.z)-Math.hypot(q.x-player.x,q.z-player.z));
  if(!list.length){dbgMsg.textContent='部族の村: ±'+Math.round(DBG_FAR*TVC/1000)+'km以内には無い';return}
  const vis=dbgVisited.tb||(dbgVisited.tb=new Set()),key=c=>Math.round(c.x)+','+Math.round(c.z);
  let pick=list.find(c=>!vis.has(key(c)));if(!pick){vis.clear();pick=list[0]}
  vis.add(key(pick));warpTo(pick.x,pick.z-TB_R+6,yawTo(0,1));                                         // 南寄りから村を向く
  dbgMsg.textContent=`部族の村（${pick.kind==='jungle'?'ジャングル':'山'}）へ移動（${vis.size}/${list.length}か所目）`;
}

// ---------- 西洋の都市（温帯・寒帯）----------
// 地形ルール: 都市は急斜面・高山・水没地を避け、川から少し離れた平坦地を優先する。川は水運・農地への近さ、海岸は港・交易への接続として立地評価に加点する。
// 中心に噴水と円形の広場。そこから8本の道が放射状に伸び、隣り合う道どうしを、あみだくじのようにランダムな高さで斜めにつなぐ。
// 道の両側には、道を正面にして建物（今は箱＋切妻屋根）が並ぶ。規模は砂漠の都市の半分以下（半径125〜190m）。
const ETC=1800;
function segDist(px,pz,s){const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((px-s[0])*dx+(pz-s[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(px-s[0]-dx*t,pz-s[1]-dz*t)}

// ---------- 教会領（帝国の森の中の、教会を中心にした村） ----------
// 中央に教会（墓地の石垣の四角）。十字の道が四方へ伸び、道沿いに家。曲がった枝道。四隅に三圃制の畑。端は十字の道の出入口以外、柵で囲む。
function abbeySites(E){
  if(E.abbeys)return E.abbeys;
  const r=mulberry(hash(E.bx,E.bz,SEED+7700)*1e9|0),L=[];E.abbeys=L;
  // 教会領は街道から少し離れた所に置く（街道から枝道が分かれて、柵の出入口へつながる）。
  // 条件は段階的に緩める。最初の段は森のなか・平らな所。帝国内に1か所も無ければ、次の段・その次の段と緩めて必ず作る。
  // dE=領土の内側へ最低どれだけ入るか / sd=王都・諸侯の街からの距離 / fo=森の度合い(負なら不問) / fl=高低差 / rv=川からの距離 / tq=砂漠の街からの距離 / ha=標高の平均の範囲 / o0,o1=街道からの横のずれ(最小,幅)
  const TIERS=[
    {n:200,dE:-700,sd:600,fo:.7,fl:10,rv:330,tq:400,hw:4,ha:[3,17],o0:330,o1:600},
    {n:300,dE:-500,sd:500,fo:.5,fl:14,rv:250,tq:300,hw:4,ha:[3,17],o0:330,o1:700},
    {n:300,dE:-300,sd:450,fo:.2,fl:20,rv:150,tq:250,hw:3,ha:[2.5,20],o0:320,o1:900},
    {n:400,dE:-150,sd:420,fo:-1,fl:30,rv:60,tq:200,hw:3,ha:[2.5,20],o0:300,o1:1100},
    {n:600,dE:-30,sd:380,fo:-1,fl:60,rv:0,tq:150,hw:3,ha:[2,30],o0:300,o1:1500},
    {n:900,dE:0,sd:380,fo:-1,fl:1e9,rv:0,tq:100,hw:2,ha:[0,60],o0:260,o1:2000,last:true}],MAXA=4;
  const sameCell=(o,x,z)=>Math.floor(o.x/ETC)===Math.floor(x/ETC)&&Math.floor(o.z/ETC)===Math.floor(z/ETC);
  const ML=E.mainLines||[];
  for(const T of TIERS){
    if(L.length>=MAXA||(T.last&&L.length>0))break;
    for(let n=0;n<T.n&&L.length<MAXA;n++){
      let x,z;
      if(ML.length){const P=ML[Math.floor(r()*ML.length)],k=Math.floor(r()*(P.length-1)),a=P[k],b=P[k+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,off=(r()<.5?-1:1)*(T.o0+r()*T.o1);x=a[0]-dz/l*off;z=a[1]+dx/l*off}
      else{const an=r()*6.2832,d=700+r()*1300;x=E.c0.x+Math.cos(an)*d;z=E.c0.z+Math.sin(an)*d}
      if(empD(E,x,z)>T.dE||E.seats.some(q=>Math.hypot(x-q.x,z-q.z)<T.sd))continue;      // 領土の中で、王都・諸侯の街から離れた所
      if(L.some(a=>Math.hypot(x-a.x,z-a.z)<2000||sameCell(a,x,z))||E.euro.some(o=>sameCell(o,x,z)))continue;   // 他の教会領・西洋の都市と同じ区画にはしない
      const rr=mulberry(hash(Math.floor(x/ETC),Math.floor(z/ETC),SEED+4244)*1e9|0),S=210+rr()*50,th=rr()*6.2832;   // makeAbbey と同じ乱数の並び
      let dm=1e9;for(const P of ML)for(const q of P){const d=Math.hypot(q[0]-x,q[1]-z);if(d<dm)dm=d}
      if(dm<S*1.42+30)continue;                                                               // 柵が街道にかからない
      const c=climateAt(x,z);
      if(T.fo>=0){if(c.bf+c.ta+c.tf+c.sq<T.fo)continue}else if(c.de>=.10)continue;           // 森のなか（緩めた段では、砂漠でなければよい）
      let mn=1e9,mx=-1e9,sum=0,cnt=0,ok=true;
      for(const d of[0,150,300])for(let i=0;i<(d?8:1)&&ok;i++){const h=rawH(x+Math.cos(i*.785)*d,z+Math.sin(i*.785)*d);if(h<WATER+T.hw)ok=false;mn=Math.min(mn,h);mx=Math.max(mx,h);sum+=h;cnt++}
      if(!ok||mx-mn>T.fl||sum/cnt<T.ha[0]||sum/cnt>T.ha[1])continue;
      if(T.rv?riverNear(x,z,T.rv,30):riverEff(x,z)<8)continue;
      if(empTownQ(x,z)<T.tq)continue;
      L.push({x,z,h:sum/cnt,S,th});
    }
  }
  return L;
}


// ---------- 教会（村=白い木造の教会と墓地 / 都市=城壁の中の石造の教会）----------
// 局所座標: x=幅 / y=上(地面=0) / z=奥行き(+zが正面・塔のある側)
function pushQuad(pos,nor,col,C,A,B,Cc,D,color,ref){
  const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],w=[Cc[0]-A[0],Cc[1]-A[1],Cc[2]-A[2]];
  let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  const fc=[(A[0]+B[0]+Cc[0]+D[0])/4-ref[0],(A[1]+B[1]+Cc[1]+D[1])/4-ref[1],(A[2]+B[2]+Cc[2]+D[2])/4-ref[2]];
  let vs=[A,B,Cc,A,Cc,D];
  if(n[0]*fc[0]+n[1]*fc[1]+n[2]*fc[2]<0){vs=[A,Cc,B,A,D,Cc];n=[-n[0],-n[1],-n[2]]}
  const l=Math.hypot(n[0],n[1],n[2])||1;C.setHex(color);
  for(const q of vs){pos.push(q[0],q[1],q[2]);nor.push(n[0]/l,n[1]/l,n[2]/l);col.push(C.r,C.g,C.b)}
}
function churchCircs(parts,Tw){                                   // 当たり判定: 各棟の壁の内側1.2mを一周する円
  const o=[];
  for(const[cx,cz,w,d]of parts){
    const hx=w/2-1.2,hz=d/2-1.2;
    for(let x=-hx;x<=hx+.01;x+=Math.max(.5,2*hx/Math.ceil(2*hx/2.2||1)))for(const z of[-hz,hz]){const p=Tw(cx+x,cz+z);o.push([p[0],p[1],1.6])}
    for(let z=-hz+2.2;z<hz-.1;z+=2.2)for(const x of[-hx,hx]){const p=Tw(cx+x,cz+z);o.push([p[0],p[1],1.6])}
  }
  return o;
}
function churchBuild(kind,Q,dep,extra){                           // Q(A,B,C,D,色,内側の点) に四角形を出す。dep=基礎の深さ
  const WH=0xf1eee6,SL=0x464b54,ST=0xd8cfba,GR=0x3f7a64,GL=0x23344f,DR=0x4a2f1c,PL=0x8d8a82,FR=0xe9e2d0;
  const bx=(cx,y0,cz,w,h,d,c)=>{const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,y1=y0+h,R=[cx,y0+h/2,cz],V=(i,j,k)=>[i?x1:x0,j?y1:y0,k?z1:z0];
    Q(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),c,R);Q(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),c,R);
    Q(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),c,R);Q(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),c,R);Q(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),c,R)};
  const roof=(cx,y,cz,w,d,rh,ov,c,wc,ax)=>{                         // 切妻屋根。ax=0:棟がz方向 / 1:棟がx方向
    const ca=ax?cz:cx,cb=ax?cx:cz,X=w/2+ov,B0=cb-d/2-ov,B1=cb+d/2+ov,yo=y-ov*rh/(w/2),P=(a,yy,b)=>ax?[b,yy,a]:[a,yy,b],R=P(ca,y-1,cb);
    for(const sd of[-1,1])Q(P(ca+sd*X,yo,B0),P(ca+sd*X,yo,B1),P(ca,y+rh,B1),P(ca,y+rh,B0),c,R);
    for(const b of[cb-d/2,cb+d/2])Q(P(ca-w/2,y,b),P(ca+w/2,y,b),P(ca,y+rh,b),P(ca,y+rh,b),wc,R)};
  const pyr=(cx,y,cz,w,d,h,c)=>{const a=[cx,y+h,cz],R=[cx,y+h*.3,cz],p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[cx+i*w/2,y,cz+j*d/2]);for(let i=0;i<4;i++)Q(p[i],p[(i+1)%4],a,a,c,R)};
  const W=(f,c,u,y,o)=>f===0?[u,y,c+o]:f===1?[u,y,c-o]:f===2?[c+o,y,u]:[c-o,y,u];   // 壁の面 f(0:+z 1:-z 2:+x 3:-x)・壁の位置c・壁に沿った位置u
  const win=(f,c,u,y,w,h,col,fr)=>{                                  // 先の尖った縦長の窓
    const P=(uu,yy,o)=>W(f,c,uu,yy,o),R=P(u,y+h/2,-4);
    if(fr!==undefined){const ww=w+.5;Q(P(u-ww/2,y-.2,.03),P(u+ww/2,y-.2,.03),P(u+ww/2,y+h,.03),P(u-ww/2,y+h,.03),fr,R);Q(P(u-ww/2,y+h,.03),P(u+ww/2,y+h,.03),P(u,y+h+ww*.9,.03),P(u,y+h+ww*.9,.03),fr,R)}
    Q(P(u-w/2,y,.07),P(u+w/2,y,.07),P(u+w/2,y+h,.07),P(u-w/2,y+h,.07),col,R);Q(P(u-w/2,y+h,.07),P(u+w/2,y+h,.07),P(u,y+h+w*.9,.07),P(u,y+h+w*.9,.07),col,R)};
  const rose=(f,c,u,y,r,col,ring)=>{const P=(uu,yy,o)=>W(f,c,uu,yy,o),R=P(u,y,-4);
    for(const[rr,cc,o]of[[r+.5,ring,.03],[r,col,.07]])for(let i=0;i<10;i++){const a0=i/10*6.2832,a1=(i+1)/10*6.2832;Q(P(u,y,o),P(u+rr*Math.cos(a0),y+rr*Math.sin(a0),o),P(u+rr*Math.cos(a1),y+rr*Math.sin(a1),o),P(u+rr*Math.cos(a1),y+rr*Math.sin(a1),o),cc,R)}};
  const strip=(f,c,u0,y0,u1,y1,t,col)=>{const P=(uu,yy,o)=>W(f,c,uu,yy,o),R=P((u0+u1)/2,(y0+y1)/2,-4);Q(P(u0,y0,.04),P(u1,y1,.04),P(u1,y1+t,.04),P(u0,y0+t,.04),col,R)};
  if(kind==='v'){
    // 白い板張りの木造の教会（写真を参考）: 暗いスレートの屋根・縦長の窓・手前の小さな玄関棟・棟の上の塔と緑の尖塔
    bx(0,0,0,8,5.4,15,WH);bx(0,0,9.3,5.4,3.8,3.6,WH);
    roof(0,5.4,0,8,15,4.2,.7,SL,WH,0);roof(0,3.8,9.3,5.4,3.6,2.4,.5,SL,WH,0);
    for(const z of[-5,-1.5,2,5.5])for(const f of[2,3])win(f,f===2?4:-4,z,1.6,.9,2.4,GL);
    win(1,-7.5,0,2.4,.9,2.2,GL);win(0,11.1,0,0,1.5,2.4,DR,0xcfc9bb);
    bx(0,5.4,3,3.4,5.8,3.4,WH);                                      // 塔の下の部分（木骨のX模様）
    for(let f=0;f<4;f++){const c=[4.7,1.3,1.7,-1.7][f],uc=f<2?0:3;strip(f,c,uc-1.3,7,uc+1.3,10,.25,0x7a4a2e);strip(f,c,uc-1.3,10,uc+1.3,7,.25,0x7a4a2e)}
    bx(0,11.2,3,2.6,2.8,2.6,WH);                                     // 鐘楼
    for(let f=0;f<4;f++)win(f,[4.3,1.7,1.3,-1.3][f],f<2?0:3,11.8,.8,1.6,GL);
    bx(0,14,3,3.2,.3,3.2,0x6b6f78);pyr(0,14.3,3,3,3,7.5,GR);bx(0,21.8,3,.1,1.6,.1,0x2a2a2e);   // 緑の尖塔と風見
    bx(0,6.1,11.0,.12,1.3,.12,0x2a2a2e);bx(0,6.7,11.0,.6,.12,.12,0x2a2a2e);                       // 玄関棟の十字架
  }else{
    // 石造の教会: 十字形の平面・正面に尖塔のある塔・尖頭アーチの窓・扶壁・半八角の後陣
    bx(0,0,0,12,14,24,ST);bx(0,0,-1.5,28,14,9,ST);
    roof(0,14,0,12,24,7,.8,SL,ST,0);roof(0,14,-1.5,9,28,7,.8,SL,ST,1);
    bx(0,0,16.5,9,18,9,ST);bx(0,17.8,16.5,9.4,.5,9.4,0xb8af99);bx(0,18,16.5,8,8,8,ST);pyr(0,26,16.5,8.8,8.8,15,GR);
    for(const sx of[-1,1])for(const sz of[-1,1]){bx(sx*3.9,18,16.5+sz*3.9,1.2,9,1.2,ST);pyr(sx*3.9,27,16.5+sz*3.9,1.5,1.5,2.6,GR)}
    bx(0,41,16.5,.15,2.2,.15,0xd9b45a);bx(0,42.2,16.5,.9,.15,.15,0xd9b45a);
    const ap=[];for(let i=0;i<=5;i++){const a=Math.PI*i/5;ap.push([6*Math.cos(a),-12-6*Math.sin(a)])}
    for(let i=0;i<5;i++){const a=ap[i],b=ap[i+1];Q([a[0],0,a[1]],[b[0],0,b[1]],[b[0],12,b[1]],[a[0],12,a[1]],ST,[0,6,-12]);Q([a[0]*1.1,12,-12+(a[1]+12)*1.1],[b[0]*1.1,12,-12+(b[1]+12)*1.1],[0,19,-12],[0,19,-12],SL,[0,8,-12])}
    for(const sd of[-1,1])for(const z of[11.4,7.4,-7,-11.4])bx(sd*6.4,0,z,1,11,1.1,ST);
    for(const f of[2,3])for(const u of[9.4,5.4,-9.2])win(f,f===2?6:-6,u,6,1.8,6,GL,FR);
    for(const f of[2,3]){win(f,f===2?14:-14,-1.5,3.5,2.4,7,GL,FR);rose(f,f===2?14:-14,-1.5,15.5,1.6,0x2b3f6a,FR)}
    win(0,21,0,0,3.4,5.4,DR,FR);rose(0,21,0,12.5,2.3,0x2b3f6a,FR);   // 正面の扉とバラ窓
    for(const f of[2,3])win(f,f===2?4.5:-4.5,16.5,8,.8,3.5,GL,FR);
    for(let f=0;f<4;f++)for(const u2 of[-1.8,1.8])win(f,[20.5,12.5,4,-4][f],(f<2?0:16.5)+u2,19.5,1.1,4.2,GL,FR);
  }
  for(const[cx,cz,w,d]of CH_PARTS[kind])bx(cx,-dep,cz,w+.6,dep+.4,d+.6,PL);   // 石の基礎
  if(extra)extra(bx);
}

// ---------- 屋敷（西洋の都市・村から道を伸ばした先。四角い庭と、建物ごと囲むフェンス）----------
// 局所座標: +zが道の側（正面の門）。屋敷=z -24〜-7 / 庭=z -10〜30 / フェンス=x ±24・z -28〜32（正面中央に門）
function manorBuild(Q,gy,dep,kind){                                    // 屋敷をMS倍にして作る（中身はmanorBuild0を拡大）
  const sc=p=>[p[0]*MS,p[1]*MS,p[2]*MS];
  return manorBuild0((A,B,Cc,D,color,ref)=>Q(sc(A),sc(B),sc(Cc),sc(D),color,sc(ref)),(lx,lz)=>gy(lx*MS,lz*MS)/MS,dep/MS,kind).map(q=>[q[0]*MS,q[1]*MS,q[2]*MS]);
}
function manorBuild0(Q,gy,dep,kind){                                    // gy(lx,lz)=地面の高さ(屋敷の基準面からの差)。戻り値=当たり判定の円[lx,lz,r]の並び
  const ST=0xdcc07a,SD=0xc4a35c,LT=0xe9dcae,SL=0x4a4d54,GL=0x1f2c3f,DR=0x4a2f1c,IR=0x25282c,HG=0x2f6a35,PT=0x9a958a;
  const bx=(cx,y0,cz,w,h,d,c)=>{const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,y1=y0+h,R=[cx,y0+h/2,cz],V=(i,j,k)=>[i?x1:x0,j?y1:y0,k?z1:z0];
    Q(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),c,R);Q(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),c,R);
    Q(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),c,R);Q(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),c,R);Q(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),c,R)};
  const roof=(cx,y,cz,w,d,rh,ov,c,wc,ax)=>{
    const ca=ax?cz:cx,cb=ax?cx:cz,X=w/2+ov,B0=cb-d/2-ov,B1=cb+d/2+ov,yo=y-ov*rh/(w/2),P=(a,yy,b)=>ax?[b,yy,a]:[a,yy,b],R=P(ca,y-1,cb);
    for(const sd of[-1,1])Q(P(ca+sd*X,yo,B0),P(ca+sd*X,yo,B1),P(ca,y+rh,B1),P(ca,y+rh,B0),c,R);
    for(const b of[cb-d/2,cb+d/2])Q(P(ca-w/2,y,b),P(ca+w/2,y,b),P(ca,y+rh,b),P(ca,y+rh,b),wc,R)};
  const pyr=(cx,y,cz,w,d,h,c)=>{const a=[cx,y+h,cz],R=[cx,y+h*.3,cz],p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[cx+i*w/2,y,cz+j*d/2]);for(let i=0;i<4;i++)Q(p[i],p[(i+1)%4],a,a,c,R)};
  const W=(f,c,u,y,o)=>f===0?[u,y,c+o]:f===1?[u,y,c-o]:f===2?[c+o,y,u]:[c-o,y,u];
  const rw=(f,c,u,y,w,h)=>{const P=(uu,yy,o)=>W(f,c,uu,yy,o),R=P(u,y+h/2,-4),B=(a0,a1,y0,y1,o,col)=>Q(P(a0,y0,o),P(a1,y0,o),P(a1,y1,o),P(a0,y1,o),col,R);   // 石の枠・ガラス・縦桟と横桟の窓
    B(u-w/2-.25,u+w/2+.25,y-.25,y+h+.25,.03,LT);B(u-w/2,u+w/2,y,y+h,.07,GL);B(u-.06,u+.06,y,y+h,.1,LT);B(u-w/2,u+w/2,y+h*.6-.06,y+h*.6+.06,.1,LT)};
  const door=(c,w,h)=>{const P=(uu,yy,o)=>W(0,c,uu,yy,o),R=P(0,h/2,-4);Q(P(-w/2-.3,0,.03),P(w/2+.3,0,.03),P(w/2+.3,h,.03),P(-w/2-.3,h,.03),LT,R);Q(P(-w/2-.3,h,.03),P(w/2+.3,h,.03),P(0,h+w*.8,.03),P(0,h+w*.8,.03),LT,R);
    Q(P(-w/2,0,.07),P(w/2,0,.07),P(w/2,h,.07),P(-w/2,h,.07),DR,R);Q(P(-w/2,h,.07),P(w/2,h,.07),P(0,h+w*.7,.07),P(0,h+w*.7,.07),DR,R)};
  const circ=[];
  if(kind===1){                                                    // 中庭型（シェーンブルン宮殿風）: 奥に本館、左右に翼棟、手前に低い棟。囲まれた中庭に芝の円と噴水、正面はオベリスクの鉄門
    const RF=0x8d4b3a,GV=0xd8cfb6,GP=0xe6dfca,LW=0x5f9140,WT=0x6fa6c4;
    const cyl=(cx,y0,cz,r,h,c,n)=>{const R=[cx,y0+h/2,cz],T0=[cx,y0+h,cz],p=i=>{const a=i/n*Math.PI*2;return[cx+Math.cos(a)*r,cz+Math.sin(a)*r]};
      for(let i=0;i<n;i++){const a=p(i),b=p(i+1);Q([a[0],y0,a[1]],[b[0],y0,b[1]],[b[0],y0+h,b[1]],[a[0],y0+h,a[1]],c,R);Q(T0,[a[0],y0+h,a[1]],[b[0],y0+h,b[1]],[b[0],y0+h,b[1]],c,R)}};
    const parts=[[0,-22,40,10],[0,-16.2,12.6,2.4],[-19,-1.5,7,51],[19,-1.5,7,51],[-14.5,26.5,15,7],[14.5,26.5,15,7]];
    for(const[cx,cz,w,d]of parts)bx(cx,-dep,cz,w+.6,dep+.4,d+.6,0x8d8a82);                         // 土台
    bx(0,-dep,7.3,31,dep+.12,48.6,GV);bx(0,.1,7.3,5,.05,48.6,GP);                                   // 中庭の砂利と中央の道
    bx(0,0,-22,40,11,10,ST);bx(0,0,-16.2,12.6,12,2.4,ST);                                          // 本館と中央の張り出し
    for(const sx of[-1,1]){bx(sx*19,0,-1.5,7,8.5,51,ST);bx(sx*14.5,0,26.5,15,5.5,7,ST)}          // 翼棟（奥から手前へ）と手前の低い棟
    bx(0,10.6,-16.85,40.4,.5,.3,LT);bx(0,11.6,-14.9,13,.5,.3,LT);bx(0,3.3,-16.9,28,.25,.3,SD);bx(0,6.9,-16.9,28,.25,.3,SD);
    for(const sx of[-1,1]){bx(sx*15.4,8.1,-1.5,.3,.5,51,LT);bx(sx*15.4,4.6,-1.5,.3,.25,51,SD)}
    roof(0,11,-22,10,40,3,.45,RF,ST,1);roof(0,12,-16.2,2.4,12.6,1.3,.25,RF,ST,1);
    for(const sx of[-1,1]){roof(sx*19,8.5,-1.5,7,51,2.6,.4,RF,ST,0);roof(sx*14.5,5.5,26.5,7,15,1.5,.3,SL,ST,1);
      for(const z of[-12,6,18])bx(sx*19,10.2,z,1.1,2.2,1.1,SD)}
    for(const x of[-12,12])bx(x,13,-22,1.2,2.4,1.2,SD);
    for(const u of[-13.8,-11,-8.2,8.2,11,13.8])for(const[y,h]of[[1.6,2.6],[5,2.4],[8.2,1.8]])rw(0,-17,u,y,1.9,h);   // 窓
    for(const u of[-3.6,3.6])for(const[y,h]of[[5,2.4],[8.3,1.8]])rw(0,-15,u,y,1.8,h);
    door(-15,2.2,3.2);rw(0,-15,0,6.2,1.6,2.2);bx(0,0,-13.6,8,.4,2.4,PT);bx(0,0,-12.5,7,.2,1.2,PT);
    for(const sx of[-1,1]){
      for(const z of[-13,-9,-5,-1,3,7,11,15,19])for(const[y,h]of[[1.6,2.6],[5.2,2.4]])rw(sx>0?3:2,sx*15.5,z,y,1.8,h);   // 中庭に面した窓
      for(const z of[-22,-16,-10,-4,2,8,14,20])for(const[y,h]of[[1.6,2.6],[5.2,2.4]])rw(sx>0?2:3,sx*22.5,z,y,1.8,h);   // 外側の窓
      for(const u of[sx*10,sx*14.5,sx*19])rw(0,30,u,1.4,2,2.4);
      for(const u of[sx*9.3,sx*12.8])rw(1,23,u,1.4,2,2.4)}
    // 中庭: 芝の円と噴水（水盤・水・柱・上の皿・像）、ランプ
    for(const sx of[-1,1]){const X=sx*8.4,Z=4;
      cyl(X,.1,Z,5.2,.12,LW,16);cyl(X,.1,Z,2.9,.7,LT,14);cyl(X,.78,Z,2.5,.04,WT,14);cyl(X,.8,Z,.45,1.9,LT,8);cyl(X,2.6,Z,1.3,.3,LT,10);cyl(X,2.88,Z,1,.04,WT,10);cyl(X,2.9,Z,.25,1,SD,6);
      circ.push([X,Z,3.2]);
      for(const z of[-11,0,11,20]){const x=sx*13.2;bx(x,.12,z,.18,3.6,.18,IR);bx(x,3.7,z,.5,.6,.5,LT);circ.push([x,z,.4])}}
    for(const q of churchCircs(parts,(x,z)=>[x,z]))circ.push(q);
  }else{
  // 建物（黄色い石灰岩・3階建て。両端に張り出した切妻の棟、中央に玄関の張り出し）
  bx(0,0,-17,36,10.5,14,ST);for(const sx of[-1,1])bx(sx*14.5,0,-15.5,7,12.5,17,ST);bx(0,0,-9.1,6,11.2,2.2,ST);
  bx(0,3.3,-9.95,22,.3,.3,SD);bx(0,6.9,-9.95,22,.3,.3,SD);bx(0,10.5,-10.3,22,.8,.3,LT);bx(0,11.2,-9.1,3.4,1.2,.5,SD);
  roof(0,10.5,-17,14,36,3.2,.4,SL,ST,1);
  for(const sx of[-1,1]){roof(sx*14.5,12.5,-15.5,7,17,3.4,.3,SL,ST,0);bx(sx*14.5,15.8,-7,1.6,1.8,.5,SD);
    for(const z of[-12,-19]){bx(sx*16.8,12.5,z,1.1,6,1.1,SD);bx(sx*16.8,18.5,z,1.5,.3,1.5,LT)}}
  for(const u of[-9.5,-6.5,6.5,9.5])for(const[y,h]of[[1.6,2.6],[5,2.4],[8.2,1.8]])rw(0,-10,u,y,1.9,h);
  for(const sx of[-1,1]){for(const[y,h]of[[1.6,2.8],[5.2,2.8],[8.8,2.4]])rw(0,-7,sx*14.5,y,4.2,h);
    for(const f of[2,3])for(const u of[-12,-19])for(const y of[2,6,9.6])rw(f,f===2?18:-18,u,y,1.8,2.4)}
  door(-8,1.8,2.8);rw(0,-8,0,6,1.6,2.4);bx(0,0,-6.6,9,.45,2.4,PT);bx(0,0,-5.4,8,.25,1.2,PT);
  for(const[cx,cz,w,d]of[[0,-17,36,14],[-14.5,-15.5,7,17],[14.5,-15.5,7,17]])bx(cx,-dep,cz,w+.6,dep+.4,d+.6,0x8d8a82);
  // 庭: 玄関まで石の小道、低い生け垣、隅のオベリスク
  for(let z=30;z>-6;z-=3.4)bx(0,gy(0,z)-.2,z,3,.3,3.5,PT);
  for(const sx of[-1,1])for(const z of[22,6])bx(sx*9,gy(sx*9,z)-.3,z,10,1.4,1,HG);
  for(const sx of[-1,1])for(const z of[-5,28]){const g=gy(sx*19,z);bx(sx*19,g-.2,z,.6,3.6,.6,ST);pyr(sx*19,g+3.4,z,.9,.9,1.2,SD)}
  for(const q of churchCircs([[0,-17,36,14],[-14.5,-15.5,7,17],[14.5,-15.5,7,17]],(x,z)=>[x,z]))circ.push(q);
  }
  // フェンス（建物も庭もぐるりと囲む。正面の中央は門）
  const post=(lx,lz)=>bx(lx,gy(lx,lz)-.2,lz,.2,1.9,.2,IR),seg=(x0,z0,x1,z1,gap)=>{
    const L=Math.hypot(x1-x0,z1-z0),n=Math.ceil(L/3),al=z0===z1;
    for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,ax=x0+(x1-x0)*t0,az=z0+(z1-z0)*t0,bx2=x0+(x1-x0)*t1,bz2=z0+(z1-z0)*t1,mx=(ax+bx2)/2,mz=(az+bz2)/2;
      if(gap&&Math.abs(mx)<gap){continue}
      post(ax,az);const g=gy(mx,mz),len=L/n;
      for(const hh of[.45,1.35])bx(mx,g+hh,mz,al?len:.07,.09,al?.07:len,IR);
      for(let q=.7;q<len;q+=1.4){const px=ax+(bx2-ax)*q/len,pz=az+(bz2-az)*q/len;circ.push([px,pz,.7])}}};
  seg(-24,-28,24,-28);seg(-24,32,24,32,kind===1?5.2:2.4);seg(-24,-28,-24,32);seg(24,-28,24,32);
  for(const[x,z]of[[-24,-28],[24,-28],[-24,32],[24,32]])post(x,z);
  if(kind===1){                                                    // 正面: オベリスクの門柱と鉄の門（中央は開いている）
    const IRN=IR;
    for(const sx of[-1,1]){const X=sx*5.4,g=gy(X,32);bx(X,g-.2,32,2.2,1.6,2.2,ST);bx(X,g+1.4,32,1.1,5.4,1.1,ST);pyr(X,g+6.8,32,1.1,1.1,1.8,SD);bx(X,g+8.6,32,.5,.5,.5,SD);circ.push([X,32,1.4])}
    for(let u=-4.6;u<=4.61;u+=.55){if(Math.abs(u)<2.2)continue;const g=gy(u,32);bx(u,g-.1,32,.07,2.4,.07,IRN)}
    for(const sx of[-1,1]){const g=gy(sx*3.5,32);for(const hh of[.5,2])bx(sx*3.5,g+hh,32,2.6,.08,.08,IRN);for(const x of[2.9,3.9,4.7])circ.push([sx*x,32,.7])}
  }else for(const sx of[-1,1]){const g=gy(sx*2.7,32);bx(sx*2.7,g-.2,32,.8,3,.8,ST);pyr(sx*2.7,g+2.8,32,1.1,1.1,.8,SD)}
  return circ;
}
function manorSample(Wd,H,kind){                                       // 屋敷の足もとの基準の高さ(最高)と最低
  let mx=-1e9,mn=1e9;for(const lx of[-18,0,18])for(const lz of(kind===1?[-24,-17,-10,0,10,20,28]:[-24,-17,-10])){const q=Wd(lx*MS,lz*MS),h=H(q[0],q[1]);mx=Math.max(mx,h);mn=Math.min(mn,h)}return[mx,mn];
}
function inManor(m,x,z,mg){                                       // 屋敷の敷地(フェンスの外mg m)の中か。mはox,oz,ry
  const c=Math.cos(m.ry),s=Math.sin(m.ry),dx=x-m.ox,dz=z-m.oz,lx=dx*c-dz*s,lz=dx*s+dz*c;
  return lx>-24*MS-mg&&lx<24*MS+mg&&lz>-28*MS-mg&&lz<32*MS+mg;
}
function drawStoneBaseHall(h,quad,r){                             // 横長で下が石造りの台（背の高い石の1階＋アーチ窓）の上に、木骨の上階（×の筋交い・アーチ窓）と大きな屋根・煙突がのる建物。h={x,z,ry,w,d,y0}。玄関は局所+z側
  const c=Math.cos(h.ry),s=Math.sin(h.ry),T=(lx,ly,lz)=>[h.x+lx*c+lz*s,h.y0+ly,h.z-lx*s+lz*c];
  const w=h.w,d=h.d,hw=w/2,hd=d/2,pk=a=>a[Math.floor(r()*a.length)];
  const STONE=pk([0x9a968c,0xa6a195,0x8d8a82]),LIGHT=0xc8c0ae,PLAS=pk([0xe8dcc0,0xf0e6d0,0xd9c49a,0xf2efe6]),TIM=0x4a3322,GLASS=0x2a3544,DARK=0x1d1a18;
  const ROOFC=pk([0xa8432c,0xb5503a,0x9a3a28,0x555a62,0x7a6a50]);
  const PL=.45,G=4.2,U=3.2,H=G+U,J=.6;                              // PL=台の石の段 G=石の1階の高さ U=上階の高さ J=上階の張り出し
  const box=(cx,cy,cz,sx,sy,sz,color)=>{const V=(i,j,k)=>T(cx+(i-.5)*sx,cy+(j-.5)*sy,cz+(k-.5)*sz),R=T(cx,cy,cz);
    quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),color,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),color,R);
    quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),color,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),color,R);
    quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),color,R);quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),color,R)};
  const PT=(f,u,y,p)=>f===0?T(u,y,p):f===1?T(u,y,-p):f===2?T(p,y,u):T(-p,y,u);
  const rect=(f,u,y,ww,hh,p,color)=>quad(PT(f,u-ww/2,y-hh/2,p),PT(f,u+ww/2,y-hh/2,p),PT(f,u+ww/2,y+hh/2,p),PT(f,u-ww/2,y+hh/2,p),color,T(0,y,0));
  const strip=(f,u0,y0,u1,y1,p,t,color)=>{const dx=u1-u0,dy=y1-y0,l=Math.hypot(dx,dy)||1,nx=-dy/l*t/2,ny=dx/l*t/2;quad(PT(f,u0+nx,y0+ny,p),PT(f,u1+nx,y1+ny,p),PT(f,u1-nx,y1-ny,p),PT(f,u0-nx,y0-ny,p),color,T(0,(y0+y1)/2,0))};
  const arch=(f,u,y0,ww,hh,p,color)=>{const r0=ww/2,yc=y0+hh-r0;rect(f,u,(y0+yc)/2,ww,yc-y0,p,color);   // アーチ形（下は四角、上は半円）
    const N=7;for(let i=0;i<N;i++){const a0=Math.PI*i/N,a1=Math.PI*(i+1)/N,C=PT(f,u,yc,p),A=PT(f,u+r0*Math.cos(a0),yc+r0*Math.sin(a0),p),B=PT(f,u+r0*Math.cos(a1),yc+r0*Math.sin(a1),p);quad(C,A,B,B,color,T(0,yc,0))}};
  const archWin=(f,u,y0,ww,hh,p,sill)=>{arch(f,u,y0-.15,ww+.5,hh+.3,p+.02,LIGHT);arch(f,u,y0,ww,hh,p+.05,GLASS);rect(f,u,y0+hh*.45,ww,.07,p+.08,LIGHT);rect(f,u,y0+hh*.5,.07,hh*.9,p+.08,LIGHT);if(sill)rect(f,u,y0-.2,ww+.8,.18,p+.12,LIGHT)};
  // 本体: 石の台（段）→ 石の1階 → 木骨の上階（前へ少し張り出す）
  const yd=Math.min(0,(h.ymin!==undefined?h.ymin-h.y0:0))-.3;   // 斜面では石の台を低い側の地面まで延ばす
  box(0,(PL+yd)/2,0,w+.7,PL-yd,d+.7,0x7d7a72);
  box(0,PL+(G-PL)/2,0,w,G-PL,d,STONE);
  box(0,G+.1,J/2,w+.1,.3,d+J+.1,TIM);
  box(0,(G+H)/2+.1,J/2,w,U-.1,d+J,PLAS);
  box(0,H,J/2,w+.14,.24,d+J+.14,TIM);
  for(const sx of[-1,1])for(const sz of[-1,1]){box(sx*hw,(G+H)/2+.1,J/2+sz*(d+J)/2,.3,U-.1,.3,TIM)}
  for(const x of[-hw+.5,0,hw-.5])box(x,G-.3,hd+J/2,.22,.5,J,TIM);   // 張り出しの腕木
  const pF=hd,pU=hd+J,n=Math.max(3,Math.round(w/3.7)),du=w/n,xs=[];for(let i=0;i<n;i++)xs.push(-hw+du*(i+.5));
  // 石の1階: 隅石と、アーチ窓（1つは玄関）
  for(const sx of[-1,1])for(let j=0;j<7;j++){const y=PL+.3+j*.58;rect(0,sx*(hw-.28),y,j%2?.6:.4,.5,pF+.015,LIGHT);rect(sx>0?2:3,hd-.25,y,j%2?.4:.6,.5,hw+.015,LIGHT)}
  const di=Math.floor(n/2);
  for(let i=0;i<n;i++){
    if(i===di){arch(0,xs[i],PL,1.7,3.0,pF+.04,LIGHT);arch(0,xs[i],PL,1.35,2.85,pF+.07,pk([0x3b281a,0x5a1f1f,0x1f2f4f]));box(xs[i],PL+.1,pF+.5,2.2,.2,1.0,0x8d8a82)}   // 玄関
    else archWin(0,xs[i],1.4,1.2,2.4,pF,true);
  }
  for(const f of[1,2,3]){const nn=f===1?n:Math.max(2,Math.round(d/3.6)),dd=f===1?du:d/nn;for(let i=0;i<nn;i++){const u=(f===1?-hw:-hd)+dd*(i+.5);archWin(f,u,1.4,1.0,2.2,f===1?hd:hw,false)}}
  // 木骨の上階: 柱・梁・×の筋交い（下半分）とアーチ窓（上半分）
  const yb0=G+.25,yb1=G+1.3;
  const frame=(f,p,u0,u1,nn,win)=>{const dd=(u1-u0)/nn;
    rect(f,(u0+u1)/2,yb0,u1-u0,.2,p+.012,TIM);rect(f,(u0+u1)/2,yb1,u1-u0,.2,p+.012,TIM);rect(f,(u0+u1)/2,H-.2,u1-u0,.2,p+.012,TIM);
    for(let i=0;i<=nn;i++)rect(f,u0+dd*i,(G+H)/2+.1,.22,U-.2,p+.012,TIM);
    for(let i=0;i<nn;i++){const a=u0+dd*i,b=a+dd;strip(f,a,yb0,b,yb1,p+.014,.15,TIM);strip(f,a,yb1,b,yb0,p+.014,.15,TIM);
      if(win)archWin(f,(a+b)/2,G+1.55,1.0,1.4,p,true);}};
  frame(0,pU,-hw,hw,n,true);frame(1,hd,-hw,hw,n,true);
  frame(2,hw,-hd,hd+J,Math.max(2,Math.round((d+J)/3.4)),false);frame(3,hw,-hd,hd+J,Math.max(2,Math.round((d+J)/3.4)),false);
  // 大きな屋根（棟は横長の向き）・妻の三角・煙突
  const ov=.55,X=hw+.5,zc=J/2,hz=(d+J)/2+ov,rh=Math.max(3.2,Math.min(6.2,hz*1.05));
  quad(T(-X,H,zc+hz),T(X,H,zc+hz),T(X,H+rh,zc),T(-X,H+rh,zc),ROOFC,T(0,H-1,zc));quad(T(-X,H,zc-hz),T(X,H,zc-hz),T(X,H+rh,zc),T(-X,H+rh,zc),ROOFC,T(0,H-1,zc));
  for(const sx of[-1,1])quad(T(sx*hw,H,zc-(d+J)/2),T(sx*hw,H,zc+(d+J)/2),T(sx*hw,H+rh,zc),T(sx*hw,H+rh,zc),PLAS,T(0,H,zc));
  box(0,H+rh+.06,zc,w+1.1,.16,.34,0x7a2d20);
  const cxp=hw*.6;box(cxp,H+(rh+1.6)/2,zc,1.0,rh+1.6,1.0,0x9a4a38);box(cxp,H+rh+1.7,zc,1.3,.22,1.3,0x55555a);
}
function drawTownHouse(h,quad,r){                                 // 公国の街の家1軒。石の1階＋木骨の上階・張り出し・多様な屋根・屋根窓・日よけ・鎧戸など。h={x,z,ry,w,d,y0}。玄関は局所+z側
  if(h.w>=9&&h.d>=6&&hash(Math.round(h.x*7),Math.round(h.z*7),SEED+5959)<.3){drawStoneBaseHall(h,quad,r);return}   // 横幅のある区画の約30%は、石の台の上に木骨の上階がのる横長の建物
  const c=Math.cos(h.ry),s=Math.sin(h.ry),T=(lx,ly,lz)=>[h.x+lx*c+lz*s,h.y0+ly,h.z-lx*s+lz*c];
  const w=h.w,d=h.d,hw=w/2,hd=d/2,pk=a=>a[Math.floor(r()*a.length)];
  const STONE=[0x9a968c,0xa6a195,0x8d8a82,0xb0aa9a],PLAS=[0xe8dcc0,0xf0e6d0,0xd9c49a,0xe0cfae,0xcdb98f,0xf2efe6,0xd8b88a],TIM=0x4a3322,CRM=0xe6dcc4;
  const TILE=[0xa8432c,0xb5503a,0x9a3a28],SHIN=[0x7a6a50,0x6e6048,0x857553],SLATE=[0x555a62,0x4a4f58],THATCH=[0xb09a5e,0xa68c52];
  const SHUT=[0x2f6f4a,0x1f3a63,0x7a1f2e,0x3f5f3a,0xb8892e],DOOR=[0x3b281a,0x5a1f1f,0x1f2f4f,0x22252a,0x6a4a2c],AWN=[0xe8e0cc,0xc23a2e,0x2f6f4a,0x1f3a63,0xb8892e];
  const kr=r(),kind=kr<.5?0:kr<.7?1:kr<.88?2:3;                  // 0=石の1階+漆喰の木骨の上階 1=石の1階+板張りの上階 2=全部漆喰の木骨 3=全部石
  const nf=r()<.4?3:2,G=3.1,U=2.8,H=G+(nf-1)*U;
  const stone=pk(STONE),plas=pk(PLAS),wood=pk([0x7a5a3a,0x6b4f33,0x8a6a45]);
  const upC=kind===1?wood:kind===3?stone:plas,gC=kind===2?plas:stone;
  const J=(kind!==3&&r()<.6)?.7:0,zc=J/2,hdd=(d+J)/2;             // J=上階が通りへ張り出す量
  const box=(cx,cy,cz,sx,sy,sz,color)=>{const V=(i,j,k)=>T(cx+(i-.5)*sx,cy+(j-.5)*sy,cz+(k-.5)*sz),R=T(cx,cy,cz);
    quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),color,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),color,R);
    quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),color,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),color,R);
    quad(V(0,1,0),V(1,1,0),V(1,1,1),V(0,1,1),color,R);quad(V(0,0,0),V(1,0,0),V(1,0,1),V(0,0,1),color,R)};
  const PT=(f,u,y,p)=>f===0?T(u,y,p):f===1?T(u,y,-p):f===2?T(p,y,u):T(-p,y,u);     // 壁の面 f(0:+z 1:-z 2:+x 3:-x)・面に沿った位置u・高さy・面の位置p
  const rect=(f,u,y,ww,hh,p,color)=>quad(PT(f,u-ww/2,y-hh/2,p),PT(f,u+ww/2,y-hh/2,p),PT(f,u+ww/2,y+hh/2,p),PT(f,u-ww/2,y+hh/2,p),color,T(0,y,0));
  const strip=(f,u0,y0,u1,y1,p,t,color)=>{const dx=u1-u0,dy=y1-y0,l=Math.hypot(dx,dy)||1,nx=-dy/l*t/2,ny=dx/l*t/2;quad(PT(f,u0+nx,y0+ny,p),PT(f,u1+nx,y1+ny,p),PT(f,u1-nx,y1-ny,p),PT(f,u0-nx,y0-ny,p),color,T(0,(y0+y1)/2,0))};
  const win=(f,u,y,p,ww,hh)=>{rect(f,u,y,ww+.3,hh+.3,p+.03,CRM);rect(f,u,y,ww,hh,p+.06,0x2a3544);rect(f,u,y,.07,hh,p+.09,CRM);rect(f,u,y+hh*.12,ww,.07,p+.09,CRM)};
  // 本体
  box(0,(G-.3)/2,0,w,G+.3,d,gC);
  box(0,(G+H)/2,zc,w,H-G,d+J,upC);
  if(kind===3)box(0,H,zc,w+.3,.3,d+J+.3,0xc8c0ae);
  else{box(0,G,zc,w+.1,.25,d+J+.1,TIM);box(0,H,zc,w+.14,.22,d+J+.14,TIM);
    for(const sx of[-1,1])for(const sz of[-1,1])box(sx*hw,(G+H)/2,zc+sz*(d+J)/2,.3,H-G,.3,TIM)}
  if(kind===2)for(const sx of[-1,1])for(const sz of[-1,1])box(sx*hw,G/2,sz*hd,.3,G,.3,TIM);
  if(J){for(const x of[-hw+.4,0,hw-.4])box(x,G-.3,hd+J/2,.22,.5,J,TIM);}   // 張り出しの腕木
  const n=Math.max(2,Math.round(w/3.3)),xs=[];for(let i=0;i<n;i++)xs.push((i-(n-1)/2)*(w/n));
  const di=Math.floor(r()*n),pF=hd,pU=hd+J;
  // 木骨（漆喰の壁）
  const frame=(f,p,u0,u1,y0,y1,nn,diag)=>{const du=(u1-u0)/nn;
    rect(f,(u0+u1)/2,y0+.11,u1-u0,.22,p+.012,TIM);rect(f,(u0+u1)/2,y1-.11,u1-u0,.22,p+.012,TIM);
    for(let i=0;i<=nn;i++)rect(f,u0+du*i,(y0+y1)/2,.2,y1-y0,p+.012,TIM);
    if(diag)for(let i=0;i<nn;i++)if(r()<.5){const a=u0+du*i,b=a+du;if(r()<.5)strip(f,a,y0+.2,b,y1-.2,p+.012,.16,TIM);else strip(f,a,y1-.2,b,y0+.2,p+.012,.16,TIM)}};
  const nS=Math.max(2,Math.round((d+J)/3.3));
  if(kind===0||kind===2)for(let k=nf-1;k>=(kind===2?0:1);k--){const y0=k?G+(k-1)*U:0,y1=k?G+k*U:G;
    frame(0,k?pU:pF,-hw,hw,y0,y1,n,true);frame(1,hd,-hw,hw,y0,y1,n,true);frame(2,hw,-hd,hd+J,y0,y1,nS,true);frame(3,hw,-hd,hd+J,y0,y1,nS,true)}
  if(kind===1){for(let k=1;k<nf;k++){const y0=G+(k-1)*U;rect(0,0,y0+U-.11,w,.22,pU+.012,TIM)}
    for(let x=-hw+.35;x<hw-.2;x+=.55)rect(0,x,(G+H)/2,.05,H-G-.3,pU+.012,0x3a2a1c)}                       // 板張りの継ぎ目
  if(gC===stone)for(const sx of[-1,1])for(let j=0;j<5;j++){const y=.3+j*.62;rect(0,sx*(hw-.28),y,j%2?.6:.4,.5,pF+.015,0xc8c0ae);rect(sx>0?2:3,hd-.25,y,j%2?.4:.6,.5,hw+.015,0xc8c0ae)}   // 隅石
  // 前面: 玄関・窓・日よけ
  const sh=r()<.4,shc=pk(SHUT);
  for(let i=0;i<n;i++){
    if(i===di){rect(0,xs[i],1.15,1.2,2.3,pF+.05,pk(DOOR));rect(0,xs[i],2.5,1.6,.3,pF+.08,0xd8cfba);box(xs[i],.08,pF+.5,1.6,.16,.9,0x8d8a82)}
    else win(0,xs[i],1.75,pF,1.0,1.25);
    for(let k=1;k<nf;k++){const yc=G+(k-1)*U+1.45;win(0,xs[i],yc,pU,1.05,1.35);
      if(sh){rect(0,xs[i]-.8,yc,.45,1.5,pU+.12,shc);rect(0,xs[i]+.8,yc,.45,1.5,pU+.12,shc)}
      if(r()<.25){box(xs[i],yc-.85,pU+.22,1.2,.2,.3,0x6a4a2c);box(xs[i],yc-.68,pU+.22,1.1,.14,.26,pk([0x3f7a3a,0xc4444a,0xe0b040,0xd98aa8]))}}
  }
  if(r()<.45){const ax=xs[(di+1)%n],aw=Math.min(2.6,w/n+.4);quad(PT(0,ax-aw/2,2.9,pF),PT(0,ax+aw/2,2.9,pF),PT(0,ax+aw/2,2.35,pF+1.3),PT(0,ax-aw/2,2.35,pF+1.3),pk(AWN),T(0,0,0))}   // 日よけ
  if(nf>=2&&r()<.3){const bx=xs[(di+n-1)%n]*.9,bw=Math.min(2.4,w/n);box(bx,G+.06,pU+.55,bw,.12,1.1,0x6a4a2c);   // バルコニー
    rect(0,bx,G+.65,bw,.9,pU+1.1,0x3a2a1c)}
  if(r()<.45){const bx=xs[di]+(r()<.5?-1.3:1.3);box(bx,.4,pF+.65,.55,.8,.55,0x6a4a2c);if(r()<.6)box(bx+.6,.3,pF+.6,.7,.6,.7,0x8a6a45)}   // 樽と木箱
  if(r()<.2){const sx=xs[(di+1)%n]*.5;box(sx,3.0,pF+.5,.06,.06,1.0,0x1c1f23);box(sx,2.7,pF+.8,.07,.55,.7,pk([0xc4a050,0x8a3f2d,0x2f5f8a]))}   // 吊り看板
  // 背面・側面の窓
  for(let i=0;i<n;i++){win(1,xs[i],1.75,hd,1.0,1.25);for(let k=1;k<nf;k++)if(r()<.8)win(1,xs[i],G+(k-1)*U+1.45,hd,1.05,1.35)}
  const zs=d>11?[-hd*.5,hd*.5+J*.5]:[J/2];
  for(const f of[2,3])for(const u of zs){win(f,u,1.75,hw,.9,1.2);for(let k=1;k<nf;k++)win(f,u,G+(k-1)*U+1.45,hw,.95,1.3)}
  // 屋根
  const rk=r(),mat=rk<.45?pk(TILE):rk<.7?pk(SHIN):rk<.85?pk(SLATE):pk(THATCH),tile=rk<.45,ov=.5,X=hw+.45;
  const gableZ=(x0,x1,zf,zb,y,rise,col,fill,tim)=>{const xc=(x0+x1)/2,R=T(xc,y-1,(zf+zb)/2);                 // 棟がz方向の切妻（zfが前）。前後の三角には漆喰＋木骨
    quad(T(x0,y,zb),T(x0,y,zf),T(xc,y+rise,zf),T(xc,y+rise,zb),col,R);quad(T(x1,y,zb),T(x1,y,zf),T(xc,y+rise,zf),T(xc,y+rise,zb),col,R);
    quad(T(x0+.1,y,zf-ov),T(x1-.1,y,zf-ov),T(xc,y+rise*.97,zf-ov),T(xc,y+rise*.97,zf-ov),fill,T(xc,y,(zf+zb)/2));
    quad(T(x0+.1,y,zb+ov),T(x1-.1,y,zb+ov),T(xc,y+rise*.97,zb+ov),T(xc,y+rise*.97,zb+ov),fill,T(xc,y,(zf+zb)/2));
    if(tim){const zz=zf-ov+.03;quad(T(xc-.1,y,zz),T(xc+.1,y,zz),T(xc+.1,y+rise*.9,zz),T(xc-.1,y+rise*.9,zz),TIM,T(xc,y,(zf+zb)/2));
      const bw=(x1-x0)/2*.62;quad(T(xc-bw,y+rise*.3-.1,zz),T(xc+bw,y+rise*.3-.1,zz),T(xc+bw,y+rise*.3+.1,zz),T(xc-bw,y+rise*.3+.1,zz),TIM,T(xc,y,(zf+zb)/2))}};
  const tm=kind!==3&&kind!==1,hz=hdd+ov;let par=false;
  const rt=w>9?(r()<.6?'twin':'par'):(()=>{const q=r();return q<.45?'par':q<.8?'perp':'hip'})();
  if(rt==='par'){par=true;const rh=Math.max(2.8,Math.min(5.6,hz*1.05));
    quad(T(-X,H,zc+hz),T(X,H,zc+hz),T(X,H+rh,zc),T(-X,H+rh,zc),mat,T(0,H-1,zc));quad(T(-X,H,zc-hz),T(X,H,zc-hz),T(X,H+rh,zc),T(-X,H+rh,zc),mat,T(0,H-1,zc));
    for(const sx of[-1,1])quad(T(sx*hw,H,zc-hdd),T(sx*hw,H,zc+hdd),T(sx*hw,H+rh,zc),T(sx*hw,H+rh,zc),upC,T(0,H,zc));
    if(tile)box(0,H+rh+.06,zc,w+1,.16,.34,0x7a2d20);
    if(!/*thatch*/(rk>=.85)&&w>=6.5&&r()<.6){const nd=w>9?2:1,zf=zc+hz*.55,yb=H+rh*(1-.55)-.35;   // 屋根窓
      for(let i=0;i<nd;i++){const dx=nd===2?(i?1:-1)*w*.25:(r()<.5?-1:1)*w*.18;
        box(dx,yb+.75,zf-.6,1.5,1.5,1.2,plas);rect(0,dx,yb+.8,.8,.95,zf+.03,CRM);rect(0,dx,yb+.8,.6,.75,zf+.06,0x2a3544);
        gableZ(dx-.95,dx+.95,zf+.15,zf-1.3,yb+1.5,.8,mat,plas,false)}}
    var rz=rh;
  }else if(rt==='hip'){const rh=Math.max(2.6,Math.min(5,Math.min(hz,w/2+ov)*.95)),rx=Math.max(0,hw-hdd);
    quad(T(-X,H,zc+hz),T(X,H,zc+hz),T(rx,H+rh,zc),T(-rx,H+rh,zc),mat,T(0,H-1,zc));quad(T(-X,H,zc-hz),T(X,H,zc-hz),T(rx,H+rh,zc),T(-rx,H+rh,zc),mat,T(0,H-1,zc));
    for(const sx of[-1,1])quad(T(sx*X,H,zc-hz),T(sx*X,H,zc+hz),T(sx*rx,H+rh,zc),T(sx*rx,H+rh,zc),mat,T(0,H-1,zc));
    var rz=rh;
  }else if(rt==='perp'){const rise=Math.max(2.4,Math.min(5.5,(hw+.45)*1.1));
    gableZ(-X,X,zc+hdd+ov,zc-hdd-ov,H,rise,mat,upC,tm);
    var rz=rise;
  }else{const rise=Math.max(2.4,Math.min(5.2,(hw/2+.45)*1.15));                                 // 2つの切妻が並ぶ
    gableZ(-X,.25,zc+hdd+ov,zc-hdd-ov,H,rise,mat,upC,tm);gableZ(-.25,X,zc+hdd+ov,zc-hdd-ov,H,rise,mat,upC,tm);
    var rz=rise;
  }
  const cxp=(r()<.5?-1:1)*w*.3;box(cxp,H+(rz+1.3)/2,zc,.9,rz+1.3,.9,0x9a4a38);box(cxp,H+rz+1.4,zc,1.15,.2,1.15,0x55555a);   // 煙突
}
// ---------- 西洋の都市の建物の装飾（写真の街並みを参考）----------
const lotCache=new Map();
function shopSpec(t,lx,lz,x0,z0,rr){                            // 通りに面した区画なら、店（通りに店先を向けた低めの建物）
  for(const s of t.bz){
    const ax=s.ax==='x',a=ax?x0:z0,row=ax?lz:lx;
    if(a<s.a0||a>s.a1||(row!==s.k-1&&row!==s.k))continue;
    const face=row===s.k?-1:1,c=s.k*L-face*7,ht=rr()<.5?4.5:7.8;       // 通りの中心から店先まで3m、奥行き8m
    return{type:'b',x:ax?x0:c,z:ax?c:z0,w:ax?12.6:8,d:ax?8:12.6,ht,top:TOWN_H+ht,m:.45,mi:Math.floor(rr()*8),dome:false,min:false,uo:rr(),vo:rr(),grand:false,ready:false,town:t,shop:{ax:s.ax,face}};
  }
  return null;
}
function lotBase(lx,lz){
  if(lotCache.size>40000)lotCache.clear();
  const key=lx+','+lz;if(lotCache.has(key))return lotCache.get(key);
  const x0=(lx+.5)*L,z0=(lz+.5)*L,rr=mulberry(hash(lx,lz,SEED+7)*1e9|0);
  let o=null,sp=null;
  const t=townIn(x0,z0,20);
  if(t){
    const dx=x0-t.x,dz=z0-t.z,Ri=townEdge(t,Math.atan2(dz,dx))*INNER_K;          // Ri=その方角の内壁の半径
    if(t.kind==='city'&&Math.abs(dx)<37&&Math.abs(dz)<24)o=null;                  // 都市中央の広場
    else if(t.kind!=='city'&&Math.abs(dx)<t.HS+9&&Math.abs(dz)<t.HS+9)o=null;     // 王国の宮殿の城壁の内側とその周り
    else if(t.kind!=='city'&&Math.abs(Math.hypot(dx,dz)-Ri)<16)o=null;             // 王国の厚い内壁の帯
    else if(t.landmarks.some(m=>Math.abs(x0-m.x)<m.w/2+L/2+1&&Math.abs(z0-m.z)<m.d/2+L/2+1))o=null; // 大建築の敷地・前庭
    else if(t.kind==='city'&&Math.abs(dx)<39&&Math.abs(dz)<26)o=null;
    else if(sp=shopSpec(t,lx,lz,x0,z0,rr))o=sp;                                   // 商店街の店
    else if(rr()<t.openP){                                                     // 建物が途切れる小広場・荷さばき場
      o={type:'openlot',x0,z0,variant:Math.floor(rr()*4)};
    }
    else if(rr()<t.courtP){                                                       // 回廊つきの中庭（柱の二重列＋屋根の輪＋噴水）
      const cols=[],circs=[],add=(x,z)=>{cols.push([x0+x,z0+z]);circs.push([x0+x,z0+z,.3])};
      for(let i=0;i<5;i++){add(-5+2.5*i,-5);add(-5+2.5*i,5)}
      for(let i=1;i<4;i++){add(-5,-5+2.5*i);add(5,-5+2.5*i)}
      for(const a of[-2.8,0,2.8])for(const b of[-2.8,0,2.8])if(a||b)add(a,b);
      circs.push([x0,z0,1.35]);
      o={type:'court',x0,z0,cols,circs};
    }else{                                                                        // 建物: 小道の格子で区切ったブロックの中に、小道へ正面をそろえて並べる（小道に面する区画は壁面を小道から2.8mに固定、中の区画は中央寄せで列をそろえる）
      const Ln=ensureLanes(t);
      if(lx!==Ln.cl&&lz!==Ln.cz&&rr()>=.35){                                         // 大通りの区画には建てない（軽くするため一部の区画は空ける）
        const q=(lx>Ln.cl?2:0)+(lz>Ln.cz?1:0),V=Ln.V[q],H=Ln.H[q],a0=V.has(lx),a1=V.has(lx+1),b0=H.has(lz),b1=H.has(lz+1),HW=2.8,G=.8,cs=t.kind==='city'?.6:0;
        const ax0=x0-L/2+(a0?HW:G),ax1=x0+L/2-(a1?HW:G),az0=z0-L/2+(b0?HW:G),az1=z0+L/2-(b1?HW:G);
        let w=Math.min(ax1-ax0,7.2+cs+rr()*5.1),d=Math.min(az1-az0,7.2+cs+rr()*5.1),
          tallRoll=rr(),ht=tallRoll<t.lowP?3.8+rr()*4.8:(tallRoll<t.lowP+.16?19+rr()*12:9.5+rr()*13);
        const kv=hash(lx,lz,SEED+991),mw=ax1-ax0,md=az1-az0;let kind=null;       // 公共の建物（モスク・浴場・時計塔・天文台・隊商宿・屋上茶屋）: 建物の約1割
        if(kv<.099){kind=kv<.012?'mosque':kv<.032?'hammam':kv<.044?'tower':kv<.054?'obs':kv<.074?'inn':'tea';
          if(kind==='mosque'){w=Math.min(mw,12.6);d=Math.min(md,12.6);ht=8}
          else if(kind==='hammam'){w=Math.min(mw,11.5);d=Math.min(md,9.5);ht=4.6}
          else if(kind==='tower'){w=d=Math.min(5.2,mw,md);ht=24+hash(lx,lz,SEED+992)*6}
          else if(kind==='obs'){w=d=Math.min(9,mw,md);ht=8.2}
          else if(kind==='inn'){w=Math.min(mw,12.6);d=Math.min(md,10.4);ht=7.4}
          else{w=Math.min(mw,9);d=Math.min(md,7.6);ht=4.2}}
        const px=a0&&!a1?ax0+w/2:a1&&!a0?ax1-w/2:(ax0+ax1)/2+(rr()*2-1)*Math.min(.7,Math.max(0,(ax1-ax0-w)/2));
        const pz=b0&&!b1?az0+d/2:b1&&!b0?az1-d/2:(az0+az1)/2+(rr()*2-1)*Math.min(.7,Math.max(0,(az1-az0-d)/2));
        let ok=true;                                                              // 外壁の内側は幅10mの周回の道としてあけ、そこにかかる建物は作らない（小道は外壁のカーブに沿って終わる）
        for(const[sx,sz] of[[-1,-1],[1,-1],[1,1],[-1,1]]){const ex=px+sx*w/2-t.x,ez=pz+sz*d/2-t.z;if(Math.hypot(ex,ez)>townEdge(t,Math.atan2(ez,ex))-17){ok=false;break}}
        if(ok)o={type:'b',x:px,z:pz,w,d,ht,top:TOWN_H+ht,m:.45,mi:kind==='mosque'||kind==='hammam'||kind==='obs'?5:kind==='inn'?6:Math.floor(rr()*8),dome:rr()<.12&&!kind,min:(rr()<.06&&!kind)||kind==='mosque',uo:rr(),vo:rr(),grand:false,ready:false,town:t,kind};
      }
    }
    if(o){                                                                        // 主要な道（幅RW）にかかる建物・中庭・ヤシは作らない
      const cx=(o.type==='court'||o.type==='openlot')?o.x0:o.type==='plaza'?o.palms[0][0]:o.x,cz=(o.type==='court'||o.type==='openlot')?o.z0:o.type==='plaza'?o.palms[0][1]:o.z;
      const ex=o.type==='b'?o.w/2+o.m:(o.type==='court'||o.type==='openlot')?7:2.5,ez=o.type==='b'?o.d/2+o.m:(o.type==='court'||o.type==='openlot')?7:2.5;
      if(roadClip(t,cx,cz,ex,ez))o=null;
      else if(underDeck(t,cx,cz,ex,ez)&&o.type==='b'){o.ht=Math.min(o.ht,8.4);o.top=TOWN_H+o.ht;o.dome=o.min=false;o.kind=null}   // 橋桁の下は低く（橋にめり込まない）
    }
  }
  lotCache.set(key,o);return o;
}
// 外階段: 低い建物の壁沿いに屋上まで上がる（路地をふさがないよう、向かいの建物と1m以上あく面だけ）
function stairOf(o,lx,lz){
  if(o.stairDone)return o.stair;o.stairDone=true;o.stair=null;
  if(o.shop||((lx+lz)&1&&o.kind!=='tea')||o.ht>6.8||(o.kind&&o.kind!=='tea'))return null;
  const rr=mulberry(hash(lx,lz,SEED+13)*1e9|0);
  if(rr()<.75&&o.kind!=='tea')return null;
  const n=Math.round(o.ht/.3),rise=o.ht/n,Lr=n*.32,f0=Math.floor(rr()*4),dir=rr()<.5?-1:1;
  for(let k=0;k<4;k++){
    const f=(f0+k)%4,sgn=f%2?-1:1,alongX=f<2;
    const sx=alongX?o.x:o.x+sgn*(o.w/2+.8),sz=alongX?o.z+sgn*(o.d/2+.8):o.z;
    const hx=alongX?Lr/2:.8,hz=alongX?.8:Lr/2;
    let ok=true;
    for(const b of[...o.town.landmarks,...[-1,0,1].flatMap(a=>[-1,0,1].map(c=>lotBase(lx+a,lz+c)))]){
      if(!b||b===o||b.type!=='b')continue;
      if(Math.abs(sx-b.x)<hx+b.w/2+1&&Math.abs(sz-b.z)<hz+b.d/2+1){ok=false;break}
    }
    if(!ok)continue;
    const treads=[];
    for(let i=0;i<n;i++){
      const t=-Lr/2+(i+.5)*.32;
      treads.push({x:alongX?o.x+dir*t:sx,z:alongX?sz:o.z+dir*t,w:alongX?.32:1.6,d:alongX?1.6:.32,top:TOWN_H+(i+1)*rise,m:.25});
    }
    return o.stair={treads};
  }
  return null;
}
// サバート: 隣り合う建物の間（幅1.2〜7.5m）に架かる屋根付き通路。下は通れ、低い建物の屋上同士なら上も歩ける
function bridgesOf(o,lx,lz){
  const out=[],rr=mulberry(hash(lx,lz,SEED+11)*1e9|0);
  for(const[dx,dz] of[[1,0],[0,1]]){
    const p=rr(),B=lotBase(lx+dx,lz+dz);
    if(p>.15||!B||B.type!=='b')continue;
    const ax=dx===1;
    const gap=ax?(B.x-B.w/2)-(o.x+o.w/2):(B.z-B.d/2)-(o.z+o.d/2);
    const lo=ax?Math.max(o.z-o.d/2,B.z-B.d/2)+.8:Math.max(o.x-o.w/2,B.x-B.w/2)+.8;
    const hi=ax?Math.min(o.z+o.d/2,B.z+B.d/2)-.8:Math.min(o.x+o.w/2,B.x+B.w/2)-.8;
    if(gap<1.2||gap>7.5||hi-lo<2)continue;
    const wd=Math.min(hi-lo,4),mid=(lo+hi)/2;
    const e=ax?{x:(o.x+o.w/2+B.x-B.w/2)/2,z:mid,w:gap+.4,d:wd}:{x:mid,z:(o.z+o.d/2+B.z-B.d/2)/2,w:wd,d:gap+.4};
    let clash=false;
    for(const S of[stairOf(o,lx,lz),stairOf(B,lx+dx,lz+dz)])if(S)for(const t of S.treads)
      if(Math.abs(e.x-t.x)<e.w/2+t.w/2&&Math.abs(e.z-t.z)<e.d/2+t.d/2){clash=true;break}
    if(clash)continue;
    const kmax=Math.min(2,Math.floor((Math.min(o.ht,B.ht)-4.5)/3.3));
    e.top=TOWN_H+4.5+3.3*Math.floor(rr()*(kmax+1));e.walk=true;e.m=0;out.push(e);
  }
  return out;
}
function lotAt(lx,lz){
  const o=lotBase(lx,lz);
  if(o&&o.type==='b'&&!o.ready){o.ready=true;o.stair=stairOf(o,lx,lz);o.bridges=bridgesOf(o,lx,lz)}
  return o;
}

// ---------- three.js ----------// ---------- three.js ----------
return {townCache,deckInfo,palW,palL,bridgeAt,MOAT_M,SHOP_C,SHOP_WOOD,ACC,GOLD_M,GOLD_C,towG,addGate,prismGeo,contCache,_ctJ,contAt,contD,climateAt,canopyRaw,mtOfCell,mtBump,mtTL,LKH,desertRiverSrc,mtRivers,ensureRivers,riverScan,riverEff,segD,villageDist,habTree,habK,hitField,villageChurchSite,churchTreeBlock,updateVillages,clearVillages,portQuay,portNear,findPortCell,pwallD,pwallHit,FLD,FLDV,fieldAt,fieldColor,plainW,basinOfCell,mesaOfCell,iceCrev,iceRockW,duneSeaW,canyonZone,canyonWallW,canyonFloorW,oasisOfCell,oasisAt,oasisNearAt,oasisW,oasisTint,ensureLanes,empCache,HUT_M,HUT_B,HUT_C,empD,empForestW,empireXZ,empRoads,empDistrict,empTownQ,empCapCut,empRoadD,empFortressDeco,empFortressRoofs,empireBoundaryWalls,townOfCell,nearTowns,townEdge,townIn,FLATX,townW,heightAt,rgCache,rgOfCell,rgNear,rgClear,clearRGates,updateRGates,warpRGate,cvCache,caravanOfCell,caravanClear,caravanNear,clearCaravans,updateCaravans,dbgFind,warpCaravan,twCache,towerOfCell,twClear,twSolsNear,towerNear,clearTowerCities,updateTowerCities,warpTower,nmCache,nomadNear,nomadClear,nomadGround,clearNomads,updateNomads,warpNomad,cpCache,campOfCell,campNear,campClear,campGround,clearCamps,updateCamps,warpCamp,tbCache,tribeOfCell,tribeNear,tribeClear,tribeGround,clearTribes,updateTribes,warpTribe,pushQuad,drawTownHouse,lotCache,lotBase,lotAt};
 },
 installB:function(){
function mergeParts(parts){                                      // [{g:ジオメトリ,c:[r,g,b]}] を、面ごとの法線と頂点色つきの1つにまとめる（ローポリ）
  const pos=[],nor=[],col=[];
  for(const{g,c}of parts){
    const f=g.toNonIndexed();f.computeVertexNormals();
    const p=f.attributes.position.array,n=f.attributes.normal.array;
    for(let i=0;i<p.length;i++){pos.push(p[i]);nor.push(n[i])}
    for(let i=0;i<p.length/3;i++)col.push(c[0],c[1],c[2]);
    f.dispose();g.dispose();
  }
  const m=new THREE.BufferGeometry();
  m.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));m.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));m.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  return m;
}
const VEG=(()=>{
  const cyl=(a,b,h,seg,y,c)=>({g:new THREE.CylinderGeometry(a,b,h,seg).translate(0,y,0),c});
  const cone=(r,h,seg,y,c,flip)=>{const g=new THREE.ConeGeometry(r,h,seg);if(flip)g.rotateX(Math.PI);return{g:g.translate(0,y,0),c}};
  const ball=(r,sy,x,y,z,c)=>{const g=new THREE.IcosahedronGeometry(r,0);g.scale(1,sy,1);return{g:g.translate(x,y,z),c}};
  return{
    palm:mergeParts([cyl(.18,.3,6,6,3,[.42,.29,.17]),cone(2.6,1.2,8,6,[.35,.5,.18],true)]),                                     // ヤシ🌴（砂漠の水辺・熱帯）
    tree:mergeParts([cyl(.2,.32,3.2,6,1.6,[.4,.28,.17]),ball(2.1,.85,0,4.6,0,[.3,.55,.2]),ball(1.4,.85,.9,3.9,.4,[.36,.62,.24])]),   // 広葉樹🌳（温帯）
    pine:mergeParts([cyl(.22,.42,13,5,6.5,[.3,.2,.12]),cone(3.4,6,7,6.5,[.12,.3,.16]),cone(2.6,5.5,7,9.7,[.15,.35,.18]),cone(1.7,5,7,13,[.18,.4,.2])]),   // 針葉樹🌲（冷帯・約15m）
    pineS:mergeParts([cyl(.22,.42,13,5,6.5,[.3,.2,.12]),cone(3.4,6,7,6.5,[.62,.74,.7]),cone(2.6,5.5,7,9.7,[.74,.84,.82]),cone(1.7,5,7,13,[.9,.95,.97])]),   // 雪をかぶった針葉樹
    jungle:mergeParts([cyl(.35,.6,18,6,9,[.28,.2,.13]),ball(4.6,.7,0,19,0,[.08,.27,.09]),ball(3.2,.8,2.2,16,1,[.11,.33,.1]),ball(3,.8,-2,15.5,-1.2,[.1,.3,.09])]),   // ジャングルの背の高い木（約22m）
    seq:mergeParts([cyl(3,4,12,8,6,[.42,.22,.14]),cyl(1.3,3,48,8,36,[.4,.21,.13]),cyl(.15,1.3,20,6,70,[.38,.2,.13]),cone(5,10,6,41,[.1,.27,.14]),cone(7.5,20,7,55,[.09,.25,.13]),cone(6,18,7,64,[.12,.3,.16]),cone(4,14,7,72,[.15,.34,.18]),cone(1.8,8,6,76,[.17,.37,.2])]),   // セコイア🌲（基準は高さ約80m・根元の直径約8m。枝のない太い幹の上に樹冠）
    cactus:(()=>{const c1=[.3,.5,.3],c2=[.34,.56,.33],arm=(sx,y0,h)=>[{g:new THREE.CylinderGeometry(.2,.2,1.2,6).rotateZ(Math.PI/2).translate(sx*.7,y0,0),c:c2},ball(.24,1,sx*1.3,y0,0,c2),{g:new THREE.CylinderGeometry(.2,.2,h,6).translate(sx*1.3,y0+h/2,0),c:c2},ball(.2,1,sx*1.3,y0+h,0,c2)];   // 腕: 横の枝→角の丸い継ぎ目(球)→上へ立つ枝→先の丸み。継ぎ目の球で、曲がりの角がはみ出さない
      return mergeParts([cyl(.34,.42,5,7,2.5,c1),ball(.34,1.1,0,5,0,c1),...arm(1,2.1,1.9),...arm(-1,2.9,1.4)])})(),   // サボテン🌵（砂漠。高さ約5.4m・柱に2本の腕）
    acacia:mergeParts([cyl(.2,.32,4.4,5,2.2,[.42,.3,.2]),ball(3.3,.3,0,4.7,0,[.46,.52,.2]),ball(2,.3,1.8,3.9,.6,[.5,.56,.22])])   // サバンナの傘形の木
  };
})();
const vegM=new THREE.MeshLambertMaterial({vertexColors:true}),rockV=new THREE.MeshLambertMaterial({color:0xffffff});
// 宮殿（写真のような黄砂岩の大宮殿）: 中心に、段数ランダムの吹き抜けの本殿（最上段に大ドーム）、その左右に鏡写しの翼棟・端の塔・裏棟、前庭に生け垣
const TRIM_M=new THREE.MeshPhongMaterial({color:0xf0e0bb,shininess:4,specular:0x151515});   // 縁取り・柱・窓枠（明るい石）
const PAL_M=triplanar(new THREE.MeshPhongMaterial({color:0xe3b777,map:plainTex,shininess:2,specular:0x111111}),4.6,0,0);
function addPalace(g,p,geos){
  const pg=new THREE.Group();pg.position.set(p.x,TOWN_H+DH,p.z);pg.rotation.y=p.th;pg.scale.setScalar(p.k);g.add(pg);
  const box=(w,h,d,x,y,z)=>{                              // 石の壁（レンガ模様の大きさを面積に合わせる）
    const bg=new THREE.BoxGeometry(w,h,d),uv=bg.attributes.uv,dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
    for(let i=0;i<uv.count;i++){const f=Math.floor(i/4);uv.setXY(i,uv.getX(i)*dims[f][0]/2,uv.getY(i)*dims[f][1]/2)}
    geos.push(bg);const m=new THREE.Mesh(bg,PAL_M);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;pg.add(m);
  };
  for(const[u,v,w,d,y0,y1] of p.bx)box(w,y1-y0,d,u,(y0+y1)/2,v);                                 // 壁・楣・塔
  for(const[u,v,w,d,h,cor] of p.roofs){box(w+.8,.8,d+.8,u,h+.4,v);if(cor)box(w+.5,.5,d+.5,u,h-.25,v)}   // 屋根の板（下面が室内の天井）と軒
  for(const c of p.dc){const[kd,x,y,z,a,b]=c;
    if(kd==='D'){const m=new THREE.Mesh(minG,PAL_M);m.position.set(x,y+b/2,z);m.scale.set(a,b,a);m.castShadow=true;pg.add(m)}
    else if(kd==='M'){const m=new THREE.Mesh(domeG,DOME_M);m.position.set(x,y,z);m.scale.set(a,b,a);m.castShadow=true;pg.add(m)}
    else{const m=new THREE.Mesh(capG,MIN_M);m.position.set(x,y+1.2*a,z);m.scale.set(.5*a,a,.5*a);pg.add(m)}}
  const dm=new THREE.Object3D();
  if(p.arcs.length){const im=new THREE.InstancedMesh(archG,archM,p.arcs.length);   // 正面の尖頭アーチ（暗い凹み）
    p.arcs.forEach((a,i)=>{dm.position.set(a[0],a[1],a[2]);dm.rotation.set(0,a[5]||0,0);dm.scale.set(a[3],a[4],1);dm.updateMatrix();im.setMatrixAt(i,dm.matrix)});
    im.frustumCulled=false;pg.add(im)}
  if(p.tb.length){const im=new THREE.InstancedMesh(boxG,TRIM_M,p.tb.length);   // 縁取り・窓枠・柱の土台と頭・胸壁（箱）
    p.tb.forEach((a,i)=>{dm.position.set(a[0],a[1],a[2]);dm.rotation.set(0,0,0);dm.scale.set(a[3],a[4],a[5]);dm.updateMatrix();im.setMatrixAt(i,dm.matrix)});
    im.frustumCulled=false;im.receiveShadow=true;pg.add(im)}
  if(p.tc.length){const im=new THREE.InstancedMesh(towG,TRIM_M,p.tc.length);   // 柱（円柱）
    p.tc.forEach((a,i)=>{dm.position.set(a[0],a[1],a[2]);dm.rotation.set(0,0,0);dm.scale.set(a[3],a[4],a[3]);dm.updateMatrix();im.setMatrixAt(i,dm.matrix)});
    im.frustumCulled=false;im.receiveShadow=true;pg.add(im)}
}
const GATE_M=triplanar(new THREE.MeshPhongMaterial({color:0xe3b777,map:plainTex,shininess:2,specular:0x111111}),5.3,0,0);
const DECK_M=triplanar(new THREE.MeshPhongMaterial({color:0xd6b27c,map:plainTex,side:THREE.DoubleSide,shininess:2,specular:0x111111}),3.6,0,0);
const WALL_M=triplanar(new THREE.MeshPhongMaterial({color:0xd8b27a,map:plainTex,shininess:2,specular:0x111111}),5,0,0);
const palaces=new Map();                                  // 宮殿は巨大なので、チャンクではなくプレイヤーとの距離で出し入れする
function clearPalaces(){for(const g of palaces.values()){scene.remove(g);g.userData.geos.forEach(x=>x.dispose())}palaces.clear()}
function updatePalaces(){
  const keep=new Set();
  for(const t of nearTowns(player.x,player.z,1700)){
    if(t.kind==='city')continue;
    const p=t.pal,key=t.x+','+t.z,d=Math.hypot(p.x-player.x,p.z-player.z);
    if(d<320||(d<400&&palaces.has(key))){
      keep.add(key);
      if(!palaces.has(key)){const g=new THREE.Group(),geos=[];addPalace(g,p,geos);g.userData.geos=geos;scene.add(g);palaces.set(key,g)}
    }
  }
  for(const[k,g] of palaces)if(!keep.has(k)){scene.remove(g);g.userData.geos.forEach(x=>x.dispose());palaces.delete(k)}
}
function colorFor(h,slope,x,z){                                   // 地面の色。火の汚染の中・まわりは赤く焼け、氷の汚染の中・まわりは青く凍り、雷の汚染の中・まわりは黒ずみ、闇の汚染の中・まわりは真っ黒になる
  const c=colorFor0(h,slope,x,z);
  if(h>WATER+.3){let q=c;const f=fireNear(x,z);if(f)q=fireTint(q,f,x,z);{const oa=oasisNearAt(x,z);if(oa)q=oasisTint(q,oa,x,z)}const ic=iceNear(x,z);if(ic)q=iceTint(q,ic,x,z);const th=thuNear(x,z);if(th)q=thuTint(q,th,x,z);const dr=drkNear(x,z);if(dr)q=drkTint(q,dr,x,z);if(q!==c)return q}   // 汚染が重なる所は色が重なる（最後の闇が一番強い）
  return c;
}
function colorFor0(h,slope,x,z){
  {const pq=portQuay(x,z);if(pq)return pq}                                  // 港町の岸壁の石畳
  {const rg=rgNear(x,z);if(rg){const d=Math.hypot(x-rg.x,z-rg.z);if(rg.ty==="hole"){if(d<RG_HR*.55)return[.1,.09,.09];if(d<RG_HR+1.5)return[.42,.38,.33]}else if(d<rg.R-4)return[.62,.6,.55]}}   // ゲートの足もと
  {const tb=tribeNear(x,z);if(tb){const tc=tribeGround(tb,x,z);if(tc)return tc}}   // 部族の村の踏み固められた土
  {const nm=nomadNear(x,z);if(nm){const nc=nomadGround(nm,x,z);if(nc)return nc}}   // 遊牧民の拠点の踏み固められた土
  {const cm=campNear(x,z);if(cm){const cc=campGround(cm,x,z);if(cc)return cc}}   // 軍営の踏み固められた土
  {const tw=towerNear(x,z);if(tw){const dx=Math.abs(x-tw.x),dz=Math.abs(z-tw.z),zz=z-tw.z;   // 塔の街の地面
    if(Math.hypot(x-tw.x,zz)<TW_RW+4)return[.7,.6,.44];
    {const lx=x-tw.x;for(const q of tw.roads)if(lx>=Math.min(q[0],q[2])-q[4]&&lx<=Math.max(q[0],q[2])+q[4]&&zz>=Math.min(q[1],q[3])-q[4]&&zz<=Math.max(q[1],q[3])+q[4])return[.86,.79,.64]}   // 通り・入口からの道                                    // 正面の参道（石畳）
    if(dx<TW_R&&dz<TW_R)return[.8,.7,.52];                                            // 踏み固められた砂
    if(dx<TW_R+24&&dz<TW_R+24)return[.83,.74,.56]}}
  const cv=caravanNear(x,z);
  if(cv){const dx=Math.abs(x-cv.x),dz=Math.abs(z-cv.z);
    if(dx<cv.hw-CV_RD&&dz<cv.hd-CV_RD)return[.8,.72,.58];                              // 中庭の石畳
    if(dx<cv.hw+3&&dz<cv.hd+3)return[.7,.58,.42];
    if(dx<cv.hw+22&&dz<cv.hd+22)return[.82,.72,.54];}                                  // 踏み固められた砂
  if(h>WATER+.5){const rd=empRoadD(x,z);if(rd<5.2&&!townIn(x,z,0)&&!(typeof eu!=='undefined'&&eu&&Math.hypot(x-eu.x,z-eu.z)<eu.Rt+10)){const q=sm01(3.2,5.2,rd);return[.68-.14*q,.62-.14*q,.52-.13*q]}}   // 帝国の道（街道を少し広げ、拠点間の集落道として連続させる）
  const t=townIn(x,z,0);
  if(t){                                                  // 街の地面: 路地=明るい砂、建物の敷地=土
    const dx=x-t.x,dz=z-t.z;
    if(t.kind!=='city'&&Math.abs(dx)<t.HS&&Math.abs(dz)<t.HS){                                                         // 宮殿の城壁の内側
      const pl=palL(t.pal,x,z);
      if(t.pal.wings.some(w=>Math.abs(pl[0]-w[0])<w[2]/2&&Math.abs(pl[1]-w[1])<w[3]/2))return[.74,.68,.55];   // 棟の中の石の床
      if(Math.abs(pl[0])<BLUE.u&&pl[1]>BLUE.v0&&pl[1]<BLUE.v1)return[.82,.75,.6];                     // 青い壁の中: 石畳の広場・中庭
      if(Math.abs(pl[0])<6||Math.abs(pl[1])<6)return[.8,.73,.58];                                      // 城壁の門から青い壁へ伸びる参道
      return[.27,.46,.2];                                                                               // 青い壁と城壁のあいだの芝
      return[.82,.75,.6];                                                                             // 石畳の中庭
    }
    for(const q of t.roads){const zr=q.ax==='z',pp=zr?x:z,al=zr?z:x;if(Math.abs(pp-q.c)<RW/2&&al>q.a0&&al<q.a1)return[.8,.73,.58]}   // 主要な道
    for(const b of t.bz)if(b.ax==='x'?(Math.abs(z-b.k*L)<3.3&&x>b.a0&&x<b.a1):(Math.abs(x-b.k*L)<3.3&&z>b.a0&&z<b.a1))return[.84,.78,.64]   // 商店街の石畳
    {const Ln=ensureLanes(t),lx=Math.floor(x/L),lz=Math.floor(z/L);                  // 小道（格子の線上、幅6.4m）
      if(lx!==Ln.cl&&lz!==Ln.cz){const q=(lx>Ln.cl?2:0)+(lz>Ln.cz?1:0);
        for(const bb of[lx,lx+1])if(Ln.V[q].has(bb)&&Math.abs(x-bb*L)<3.2)return[.8,.73,.56];
        for(const bb of[lz,lz+1])if(Ln.H[q].has(bb)&&Math.abs(z-bb*L)<3.2)return[.8,.73,.56]}}
    const o=lotAt(Math.floor(x/L),Math.floor(z/L));
    if(o&&o.type==='openlot')return o.variant===0?[.72,.63,.48]:o.variant===1?[.65,.57,.43]:o.variant===2?[.76,.68,.53]:[.69,.60,.45];
    const inB=(o&&o.type==='b'&&Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2)||t.landmarks.some(m=>Math.abs(x-m.x)<m.w/2&&Math.abs(z-m.z)<m.d/2);
    return inB?[.62,.52,.38]:(o&&o.type==='court'?[.66,.57,.42]:[.7,.62,.46]);
  }
  for(const t2 of nearTowns(x,z)){                       // 外壁の外: 水路の底と岸、門の前の道（橋のむこうへ続く）
    const dx=x-t2.x,dz=z-t2.z,q=Math.hypot(dx,dz)-townEdge(t2,Math.atan2(dz,dx));
    if(q<=0||q>=FLATX+TBLEND)continue;
    if(q>40&&q<58)return[.55,.5,.36];
    for(const r of t2.roads){const zr=r.ax==='z',pp=zr?x:z,al=zr?z:x;if(Math.abs(pp-r.c)<RW/2&&al>r.a0&&al<r.a1)return[.8,.73,.58]}
    if(q<FLATX)return[.76,.68,.5];
  }
  const c=climateAt(x,z),de=c.de,sv=c.sv,st=c.st,gr=c.gr,bf=c.bf,tg=c.tg,tf=c.tf,jg=c.jg,cg=c.cg,ta=c.ta,tu=c.tu,sn=c.sn,ic=c.ic,sq=c.sq,cold=c.C;   // すぐ読む
  if(h<WATER+1.5)return[.78-.2*cold,.7-.06*cold,.52+.1*cold];            // 岸辺の砂（冷帯は灰色の砂利）
  const mb=mtBump(x,z),re=riverEff(x,z);                                 // 山の標高(山でなければ0)・川の縁までの距離
  if(re<1.4)return[.46,.44,.4];                                          // 川底の砂利
  if(re<3.6){const q=sm01(1.4,3.6,re);return[.46+.14*q,.44+.14*q,.4+.08*q]}   // 川岸
  {const vd=villageDist(x,z);if(vd<2.1)return[.58,.48,.34];if(vd<3.2){const q=sm01(2.1,3.2,vd);return[.58-.12*q,.48-.02*q,.34-.06*q]}}   // 村の道（土の道）
  {const ff=fieldAt(x,z,0);if(ff){const fc=fieldColor(ff,x,z);if(fc)return fc}}   // 畑
  if(ic>.25&&slope>.55&&iceRockW(x,z)<.3){const q=vnoise(x*.15,z*.15);return[.58+.12*q,.78+.08*q,.94+.04*q]}   // 氷河の断崖・クレバスの壁は青い氷
  if(slope>(mb>0&&mb<mtTL(x,z)-8?1.1:.55+.4*duneSeaW(x,z)*de)||(de>.1&&canyonWallW(x,z,de))){const k0=mb>185?sm01(185,250,mb)*.7:0,r0=.5+.02*cold,r1=.42+.12*cold,r2=.35+.23*cold;let q=[r0+(.93-r0)*k0,r1+(.96-r1)*k0,r2+(1-r2)*k0];
    if(de>.1){const bd=h*.3+2.5*vnoise(x*.012+8,z*.012-3),bi=Math.floor(bd),hv=hash(bi,3,SEED+777),sh=.88+.12*sm01(0,.2,bd-bi),wS=sm01(.1,.5,de)*(1-k0);   // 砂漠の岩肌: 地層の縞（赤茶〜クリーム）
      q=[q[0]+((.58+.32*hv)*sh-q[0])*wS,q[1]+((.3+.48*hv)*sh-q[1])*wS,q[2]+((.22+.36*hv)*sh-q[2])*wS]}
    return q}   // 岩肌（雪線より上は雪をかぶる）
  if(mb>0){                                                              // 山: 森林限界より上は草地→岩→雪
    const n0=vnoise(x*.02+31,z*.02-17)-.5,tl=135+40*n0;
    if(mb>tl){const a=sm01(tl,tl+50,mb),sw=sm01(190,250,mb+40*n0),nv=.08*(vnoise(x*.12,z*.12)-.5);
      const r0=.42+.08*a+nv,r1=.48+.02*a+nv,r2=.3+.19*a+nv;
      return[r0+(.93-r0)*sw,r1+(.96-r1)*sw,r2+(1-r2)*sw]}
  }
  if(h-mb>150)return[.62+.3*cold,.55+.4*cold,.48+.5*cold];                // 高い所（冷帯は雪の峰）
  const g=Math.min(1,Math.max(0,(h-WATER-1.5)/8)),n=vnoise(x*.09+5,z*.09-8)-.5,n2=vnoise(x*.35,z*.35)-.5;
  const k=Math.min(1,g*1.6),dv=1+.2*n+.04*n2;
  const ps=sm01(.55,.75,canopyRaw(x,z)),lit=sm01(.58,.68,vnoise(x*.15,z*.15));   // 森の密な所の暗さ / 落ち葉
  const col=[0,0,0],add=(w,r,gg,b)=>{if(w>.001){col[0]+=r*w;col[1]+=gg*w;col[2]+=b*w}};
  add(de,(.5+.36*k)*dv,(.58+.16*k)*dv,(.3+.2*k)*dv);                       // 砂漠: 水辺はオアシス風に緑、離れると砂色（砂丘のむら）
  add(sv,.66*(1+.25*n)+.03*n2,.6*(1+.2*n),.3*(1+.1*n));                    // サバンナ: 乾いた黄緑の草
  add(st,.62*(1+.15*n),.64*(1+.12*n),.34*(1+.1*n));                        // ステップ: 淡い黄緑の広い草原
  const gv=1+.35*n+.12*n2;add(gr,.42*gv,.62*gv,.25*gv);                    // 草原: 明るい緑
  const bv=(1+.3*n+.08*n2)*(1-.35*ps);add(bf,(.24+.06*lit)*bv,(.46-.1*lit)*bv,(.18-.02*lit)*bv);   // 広葉樹林: 落ち着いた緑と落ち葉
  const tv=1+.3*n+.1*n2;add(tg,.34*tv,.62*tv,.17*tv);                      // 熱帯草原: 鮮やかな緑
  add(tf,.16*tv,.4*tv,.12*tv);                                             // 熱帯林
  const jv=(1+.25*n)*(1-.55*ps);add(jg,.1*jv,.28*jv,.09*jv);               // ジャングル: 濃い緑（密な所はさらに暗い）
  add(cg,.5*(1+.2*n),.58*(1+.15*n),.38*(1+.1*n));                          // 寒帯の草原: くすんだ淡い緑
  const av=(1+.25*n)*(1-.4*ps);add(ta,(.2+.1*lit)*av,(.32-.07*lit)*av,(.2-.05*lit)*av);   // 針葉樹林: 暗い青緑と針葉の茶色
  const qv=(1+.25*n)*(1-.4*ps);add(sq,(.2+.16*lit)*qv,(.3-.1*lit)*qv,.13*qv);   // セコイアの森: 落ち葉と苔の、赤みのある暗い林床
  add(tu,.6,.66,.62);                                                      // 雪原の下地
  if(mb>30){const al=sm01(30,110,mb)*.55;col[0]+=(.17-col[0])*al;col[1]+=(.3-col[1])*al;col[2]+=(.19-col[2])*al}   // 山の中腹は針葉樹の暗い緑
  const sw=sm01(.35,.65,sn+.3*n2);                                         // 雪: 雪原は一面、縁はまだら
  let R=col[0]+(.93-col[0])*sw,G=col[1]+(.96-col[1])*sw,B=col[2]+(1-col[2])*sw;
  if(ic>.01){                                                            // 氷河: 白い雪→青みがかった氷（むらがあり、奥ほど青い）。クレバスは濃い青
    const ki=ic*(.3+.55*sm01(.35,.7,vnoise(x*.007+13,z*.007-6))),cr=iceCrev(x,z)*ic;
    R+=(.7-R)*ki;G+=(.86-G)*ki;B+=(.98-B)*ki;
    R+=(.4-R)*cr;G+=(.66-G)*cr;B+=(.92-B)*cr;
  }
  return[R,G,B];
}
function lowPoly(geo){                                            // 頂点共有をやめ、三角形ごとに法線と色を1つにして、面のはっきりしたローポリにする
  const f=geo.toNonIndexed();geo.dispose();const c=f.attributes.color;
  for(let i=0;i<c.count;i+=3){const r=(c.getX(i)+c.getX(i+1)+c.getX(i+2))/3,g=(c.getY(i)+c.getY(i+1)+c.getY(i+2))/3,b=(c.getZ(i)+c.getZ(i+1)+c.getZ(i+2))/3;for(let k=0;k<3;k++)c.setXYZ(i+k,r,g,b)}
  f.computeVertexNormals();return f;
}
// ---------- 遺跡群（砂漠に多い。アーチ門・列柱の通り・神殿跡・崩れた壁と散らばる石材。セルごとにランダム） ----------
// 280m四方のセルごとに、気候が砂漠に近いほど高い確率で1か所できる。街・村・川・山・集落とは重ならない。遺跡の周り(RUIN_R)には木と岩を置かない。
const ruinCache=new Map();
const RB_BOX=new THREE.BoxGeometry(1,1,1).toNonIndexed(),RB_CYL=new THREE.CylinderGeometry(1,1,1,9).toNonIndexed();
const RUIN_M=new THREE.MeshLambertMaterial({vertexColors:true});
function ruinSite(i,j){
  const key=i+','+j;if(ruinCache.has(key))return ruinCache.get(key);
  let S=null;
  const r=mulberry(hash(i,j,SEED+8800)*1e9|0);
  const px=(i+.3+.4*r())*RUIN_C,pz=(j+.3+.4*r())*RUIN_C,pr=r(),ry0=r()*Math.PI,c0=Math.cos(ry0),s0=Math.sin(ry0);
  const H=heightAt;
  const ok=(x,z)=>{const h=H(x,z);return h>WATER+3&&h<120&&mtBump(x,z)<=0&&townW(x,z)===0&&villageDist(x,z)>=40&&riverEff(x,z)>=12&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z)};
  let good=pr<.2+.55*climateAt(px,pz).de;
  if(good){let lo=1e9,hi=-1e9;for(let k=0;k<9&&good;k++){const a=k*.785,d=k?50:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d;good=ok(x,z);const h=H(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h)}}
  if(good){
    const P=[],C=[],W=(u,v)=>[px+u*c0+v*s0,pz-u*s0+v*c0];
    const col=()=>{const v=.8+.22*r(),t=r();return[(.88+.06*t)*v,(.74+.04*t)*v,(.5-.04*t)*v]};
    const box=(x,y,z,sx,sy,sz,ry,rx=0,rz=0)=>{if(H(x,z)>WATER+1.5)P.push([0,x,y,z,sx,sy,sz,rx,ry,rz,col()])};
    const cyl=(x,y,z,sx,sy,sz,ry,rx=0,rz=0)=>{if(H(x,z)>WATER+1.5)P.push([1,x,y,z,sx,sy,sz,rx,ry,rz,col()])};
    // 崩れかけた壁: 局所座標(u,v)から角度angの向きにlen。石材を積み、列ごとに高さをばらす
    const wall=(u,v,len,hmax,thick,ang)=>{
      const n=Math.max(1,Math.round(len/2.2)),sl=len/n,dl=Math.cos(ang),dv=Math.sin(ang),wx=dl*c0+dv*s0,wz=-dl*s0+dv*c0,ry=Math.atan2(-wz,wx);
      for(let m=0;m<n;m++){
        const t=(m+.5)*sl,[x,z]=W(u+dl*t,v+dv*t),g0=H(x,z),hh=Math.max(2,Math.round(hmax*(.25+.75*r())/1.1));
        for(let k=0;k<hh;k++)box(x+(r()-.5)*.2,g0-.5+1.1*k+.55,z+(r()-.5)*.2,sl*.98,1.05,thick,ry+(r()-.5)*.05);
      }
    };
    // 円柱: state 0=立っている 1=折れて短い 2=倒れている。gb=土台の上面の高さ（無ければ地面）
    const column=(u,v,state,gb)=>{
      const [x,z]=W(u,v),g0=gb===undefined?H(x,z):gb,rc=.8+.15*r();
      box(x,g0+.25,z,2.2,.9,2.2,ry0);
      let top=g0+.7;
      if(state===0){const hc=8+3*r();cyl(x,g0+.7+hc/2,z,rc,hc,rc,0);box(x,g0+.7+hc+.35,z,1.9,.7,1.9,ry0);box(x,g0+.7+hc+.9,z,2.3,.4,2.3,ry0);top=g0+.7+hc+1.1;C.push([x,z,1.2])}
      else if(state===1){const hc=1.5+3.5*r();cyl(x,g0+.7+hc/2,z,rc,hc,rc,0);top=g0+.7+hc;C.push([x,z,1.2])}
      else{const len=5.5+2.5*r(),a=r()*6.283;cyl(x+Math.cos(a)*2.5,g0+.7+rc*.7,z+Math.sin(a)*2.5,rc,len,rc,a,0,Math.PI/2);cyl(x,g0+.9,z,rc,.4,rc,0);box(x+Math.cos(a+2)*4,g0+.7+.35,z+Math.sin(a+2)*4,1.9,.7,1.9,r()*3)}
      return{x,z,top,st:state};
    };
    // ① アーチ門（写真のような、石積みの大きな門）
    const gap=7+3*r(),R=gap/2,pw=3.2,pd=3.8,hs=6.5+r()*1.5,thick=1.4;
    const gl=[-1,1].map(s=>{const[x,z]=W(s*(R+pw/2),0);return H(x,z)}),b0=Math.min(gl[0],gl[1])-1.2,G=b0+1.2;
    for(const s of[-1,1]){
      const T=G+hs+(r()<.6?2+4*r():.3*r()),nc=Math.ceil((T-b0)/2.2),ch=(T-b0)/nc;
      for(let k=0;k<nc;k++){const[x,z]=W(s*(R+pw/2)+(r()-.5)*.3,(r()-.5)*.3);box(x,b0+ch*(k+.5),z,pw+(r()-.5)*.25,ch*1.01,pd+(r()-.5)*.25,ry0+(r()-.5)*.03)}
      {const[x,z]=W(s*(R+pw/2),0);box(x,G+hs-.4,z,pw+.8,.8,pd+.6,ry0);C.push([x,z,2.3])}
    }
    const nv=11,broken=r()<.45,cut=3+Math.floor(r()*7),flip=r()<.5;let sound=!broken;
    for(let k=0;k<nv;k++){
      const kk=flip?nv-1-k:k;let drop=broken?k>=cut:r()<.1;
      if(drop){sound=false;const[x,z]=W((r()-.5)*gap*1.2,(r()-.5)*5),g=H(x,z);box(x,g+.6,z,1.5,1.2,pd*.8,r()*3,(r()-.5)*.4,(r()-.5)*.4);continue}
      const th=(kk+.5)/nv*Math.PI,Rc=R+thick/2,[x,z]=W(Rc*Math.cos(th),0);
      box(x,G+hs+Rc*Math.sin(th),z,Math.PI*Rc/nv*1.06,thick,pd,ry0,0,th+Math.PI/2);
    }
    if(sound&&r()<.7){const yT=G+hs+R+thick;for(let u=-(R+pw)+1.3;u<R+pw;u+=2.6){if(r()<.8){const[x,z]=W(u,0);box(x,yT+.6,z,2.5,1.2,pd*.9,ry0);if(r()<.5)box(x,yT+1.8,z,2.5,1.2,pd*.9,ry0)}}}
    for(const s of[-1,1])if(r()<.7)wall(s*(R+pw),0,6+8*r(),3+3*r(),pd*.7,s>0?0:Math.PI);
    // ② 門を貫く通りの両側に並ぶ列柱
    const rowU=R+pw+3,sp=4.6+r()*1.2,ncol=3+Math.floor(r()*6);
    for(const dv of[1,-1]){
      if(dv<0&&r()<.5)continue;
      const prev=[null,null];
      for(let k=0;k<ncol;k++)for(let si=0;si<2;si++){
        const q=r(),st=q<.45?0:q<.75?1:q<.92?2:-1;if(st<0){prev[si]=null;continue}
        const c=column((si?1:-1)*rowU+(r()-.5)*.4,dv*(8+k*sp+(r()-.5)*.6),st);
        const p=prev[si];
        if(p&&p.st===0&&st===0&&r()<.5){box((p.x+c.x)/2,Math.min(p.top,c.top)+.5,(p.z+c.z)/2,sp-.3,.9,1.4,ry0+Math.PI/2)}
        prev[si]=c;
      }
    }
    // ③ 神殿跡（基壇の上に柱廊がめぐる）
    const pd0=38+12*r(),pa=r()*6.283,pu=Math.cos(pa)*pd0,pv=Math.sin(pa)*pd0,[tx,tz]=W(pu,pv);
    let temple=ok(tx,tz);
    if(temple){const nx=4+Math.floor(r()*3),nz=5+Math.floor(r()*4),s5=5.2,w=(nx-1)*s5,d=(nz-1)*s5;
      let lo=1e9,hi=-1e9;for(const a of[-1,1])for(const b of[-1,1]){const[x,z]=W(pu+a*(w/2+2),pv+b*(d/2+2)),h=H(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h)}
      const gb=hi+.3;
      if(r()<.8)box(tx,(lo-.6+gb)/2,tz,w+4.4,gb-lo+.6,d+4.4,ry0);
      const base=r()<.8?gb:undefined;
      for(let a=0;a<nx;a++)for(let b=0;b<nz;b++){
        if(a>0&&a<nx-1&&b>0&&b<nz-1)continue;
        const q=r(),st=q<.4?0:q<.75?1:q<.9?2:-1;if(st<0)continue;
        column(pu+(a-(nx-1)/2)*s5,pv+(b-(nz-1)/2)*s5,st,base);
      }
      const iw=w-s5*1.2,id=d-s5*1.2,wh=3+3*r();
      wall(pu-iw/2,pv-id/2,iw,wh,1.4,0);wall(pu-iw/2,pv+id/2,iw,wh,1.4,0);wall(pu-iw/2,pv-id/2,id,wh,1.4,Math.PI/2);
      if(r()<.6)wall(pu+iw/2,pv-id/2,id*.5,wh,1.4,Math.PI/2);
    }
    // ④ 独立した円柱・崩れた壁・散らばる石材
    for(let k=0,n=1+Math.floor(r()*3);k<n;k++){const a=r()*6.283,d=25+35*r();column(Math.cos(a)*d,Math.sin(a)*d,r()<.5?0:1)}
    for(let k=0,n=2+Math.floor(r()*3);k<n;k++){const a=r()*6.283,d=15+40*r();wall(Math.cos(a)*d,Math.sin(a)*d,5+7*r(),2+3*r(),1.4,r()*6.283)}
    const scatter=(cu,cv,rad,n)=>{for(let k=0;k<n;k++){
      const a=r()*6.283,d=Math.sqrt(r())*rad,[x,z]=W(cu+Math.cos(a)*d,cv+Math.sin(a)*d),g=H(x,z),sx=.9+1.8*r(),sy=.7+1.1*r(),sz=.9+1.6*r();
      if(r()<.2)cyl(x,g+.7,z,.8,1.2+r(),.8,r()*3,0,Math.PI/2);
      else{box(x,g+sy*.3,z,sx,sy,sz,r()*3.14,(r()-.5)*.5,(r()-.5)*.5);if(sx>1.9)C.push([x,z,sx*.5])}}};
    scatter(0,0,38,16+Math.floor(14*r()));
    if(temple)scatter(pu,pv,30,12+Math.floor(10*r()));
    S={x:px,z:pz,R:RUIN_R,P,C:[],B:ruinSolids(P)};
  }
  ruinCache.set(key,S);return S;
}
// ---------- 遺跡の石材の当たり判定（見た目の形どおり。上面に立てて、下はくぐれる） ----------
// 石材1つ1つを「高さ[bot,top]を持つ柱」にする。k=0: 向きつきの箱 / k=1: 円柱(円) / k=2: 多角形の柱(pts=[[x,z],…]。凹んでいてもよい)。
// 立っている箱・円柱はそのままの形(k=0,1)。傾いた箱・円柱、円錐(尖塔・木の葉)、半球(ドーム)は、見た目のメッシュ(凸)を水平に輪切りにした断面の多角形の柱を積んで、形どおりに近づける。
// 輪切りの厚みは、断面の形が変わる速さで自動に決める（ほぼ垂直な面は厚く、傾いた面は薄く。最小0.15m＜段差STEP）。
function hull2(P){                                          // 2次元の凸包（面積がほぼ0ならnull）
  if(P.length<3)return null;
  P.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),H=[];
  for(const p of P){while(H.length>=2&&cr(H[H.length-2],H[H.length-1],p)<=1e-9)H.pop();H.push(p)}
  const t=H.length+1;
  for(let i=P.length-2;i>=0;i--){const p=P[i];while(H.length>=t&&cr(H[H.length-2],H[H.length-1],p)<=1e-9)H.pop();H.push(p)}
  H.pop();if(H.length<3)return null;
  let A=0;for(let i=0,j=H.length-1;i<H.length;j=i++)A+=H[j][0]*H[i][1]-H[i][0]*H[j][1];
  return Math.abs(A)<2e-3?null:H;
}
function sliceHull(V,h){                                    // 凸な立体(頂点V=[x,y,z]の群)を高さhの水平面で切った断面（頂点どうしを結ぶ線分と面の交点の凸包）
  const P=[],n=V.length;
  for(let i=0;i<n;i++){const a=V[i],da=a[1]-h;
    for(let j=i+1;j<n;j++){const b=V[j],db=b[1]-h;
      if(da*db<0){const t=da/(da-db);P.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t])}}}
  return hull2(P);
}
function unitVerts(t,seg){                                  // 見た目と同じ形の単位メッシュの頂点（t=0 箱 / 1 円柱 / 2 円錐 / 3 半球）
  const C=unitVerts._c||(unitVerts._c={}),key=t+'_'+seg;if(C[key])return C[key];
  const V=[];
  if(t===0){for(const a of[-.5,.5])for(const b of[-.5,.5])for(const c of[-.5,.5])V.push([a,b,c])}
  else if(t===1){for(let k=0;k<seg;k++){const th=k/seg*6.2832;for(const y of[-.5,.5])V.push([Math.sin(th),y,Math.cos(th)])}}
  else if(t===2){V.push([0,.5,0]);for(let k=0;k<8;k++){const th=k/8*6.2832;V.push([Math.sin(th),-.5,Math.cos(th)])}}
  else{V.push([0,1,0]);for(let iy=1;iy<=8;iy++){const th=iy/8*1.5708;for(let ix=0;ix<12;ix++){const ph=ix/12*6.2832;V.push([-Math.cos(ph)*Math.sin(th),Math.cos(th),Math.sin(ph)*Math.sin(th)])}}}
  return C[key]=V;
}
function convexLayers(out,V,tol){                           // 凸な立体を水平に輪切りにして、多角形の柱(k=2)を積む
  let y0=1e9,y1=-1e9;for(const p of V){if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]}
  const H=y1-y0;if(H<.02)return;
  const eps=Math.min(.03,H*.02),cs=y=>sliceHull(V,Math.min(y1-eps,Math.max(y0+eps,y)));
  const bb=P=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const p of P){if(p[0]<a)a=p[0];if(p[0]>b)b=p[0];if(p[1]<c)c=p[1];if(p[1]>d)d=p[1]}return[a,b,c,d]};
  const df=(P,Q)=>{                                         // 2つの断面の形の違い（外接の矩形のずれ）
    if(!P&&!Q)return 0;
    if(!P||!Q){const A=bb(P||Q);return Math.max(A[1]-A[0],A[3]-A[2])*.5}
    const A=bb(P),B=bb(Q);return Math.max(Math.abs(A[0]-B[0]),Math.abs(A[1]-B[1]),Math.abs(A[2]-B[2]),Math.abs(A[3]-B[3]))};
  const Ls=[];
  const rec=(a,b,pa,pb,d)=>{const m=(a+b)/2,pm=cs(m);
    if(d>=6||b-a<=.15||(df(pa,pm)<=tol&&df(pm,pb)<=tol)){Ls.push([a,b,pm||pa||pb]);return}
    rec(a,m,pa,pm,d+1);rec(m,b,pm,pb,d+1)};
  rec(y0,y1,cs(y0),cs(y1),0);
  Ls[Ls.length-1][2]=cs(y1)||Ls[Ls.length-1][2];            // いちばん上の層は、上面の形にそろえる（その上に立てる）
  for(const[a,b,P]of Ls){if(!P)continue;let cx=0,cz=0;for(const p of P){cx+=p[0];cz+=p[1]}cx/=P.length;cz/=P.length;
    let r=0;for(const p of P)r=Math.max(r,Math.hypot(p[0]-cx,p[1]-cz));out.push({k:2,x:cx,z:cz,pts:P,r,bot:a,top:b})}
}
function pieceSolids(out,t,x,y,z,sx,sy,sz,rx,ry,rz){
  const flat=Math.abs(rx)<.05&&Math.abs(rz)<.05;
  if(t===1&&flat){const rad=(sx+sz)/2*.973;out.push({k:1,x,z,rad,r:rad,bot:y-sy/2,top:y+sy/2});return}   // 立った円柱（見た目の多角形の外接円と内接円の中間）
  const e=pieceSolids._e||(pieceSolids._e=new THREE.Euler()),m=pieceSolids._m||(pieceSolids._m=new THREE.Matrix4());
  e.set(rx,ry,rz);m.makeRotationFromEuler(e);const el=m.elements;
  if(t===0&&flat){                                          // ほぼ水平な箱: 向きつきの箱のまま
    const h=[sx/2,sy/2,sz/2];
    let cs=Math.cos(ry),sn=Math.sin(ry);const hl=Math.hypot(el[0],el[2]);if(hl>.3){cs=el[0]/hl;sn=-el[2]/hl}
    let hu=0,hv=0,hy=0;
    for(let j=0;j<3;j++){const ax=el[j*4],ay=el[j*4+1],az=el[j*4+2];hu+=Math.abs(ax*cs-az*sn)*h[j];hv+=Math.abs(ax*sn+az*cs)*h[j];hy+=Math.abs(ay)*h[j]}
    out.push({k:0,x,z,cs,sn,hu,hv,r:Math.hypot(hu,hv),bot:y-hy,top:y+hy});return}
  const U=unitVerts(t,10),V=U.map(v=>{const a=v[0]*sx,b=v[1]*sy,c=v[2]*sz;return[x+el[0]*a+el[4]*b+el[8]*c,y+el[1]*a+el[5]*b+el[9]*c,z+el[2]*a+el[6]*b+el[10]*c]});
  convexLayers(out,V,.12);                                  // 傾いた箱・円柱、円錐、半球
}
function ruinSolids(P){const out=[];for(const a of P)pieceSolids(out,a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8],a[9]);return out}
function ruinSolidsAt(x,z,out,m){m=m||0;                                   // プレイヤーの近くにある遺跡（地上・山）の石材
  for(const[SF,SC,SR]of[[ruinSite,RUIN_C,RUIN_R],[mtRuinSite,MTR_C,MTR_R]]){
    const i0=Math.floor(x/SC),j0=Math.floor(z/SC);
    for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++){
      const S=SF(i,j);if(!S||!S.B||Math.hypot(x-S.x,z-S.z)>SR+40)continue;
      for(const b of S.B)if(Math.abs(b.x-x)<b.r+3+m&&Math.abs(b.z-z)<b.r+3+m)out.push(b);
    }}
}
function ruinClear(x,z){                                          // 遺跡のまわり（木・岩を置かない）
  const i0=Math.floor(x/RUIN_C),j0=Math.floor(z/RUIN_C);
  for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++){const S=ruinSite(i,j);if(S&&Math.hypot(x-S.x,z-S.z)<S.R)return true}
  return false;
}
// ---------- 山の遺跡（稀。森林限界より上の山の上に、宙に浮かぶ環と球（アーミラリー）と、立石・崩れた石材） ----------
function mtRuinBuild(px,pz,r){
  const P=[],C=[],H=heightAt,jit=(c,a=.1)=>{const t=1+(r()-.5)*2*a;return[c[0]*t,c[1]*t,c[2]*t]};
  const ST=[.58,.52,.46],BR=[.64,.56,.44],RG=[.5,.45,.4],put=(t,x,y,z,sx,sy,sz,rx,ry,rz,c)=>P.push([t,x,y,z,sx,sy,sz,rx,ry,rz,c]);
  const g0=H(px,pz),cy=g0+27;
  put(1,px,g0-1.5,pz,9,5,9,0,0,0,jit(ST));put(1,px,g0+1.4,pz,6,1,6,0,0,0,jit(ST));C.push([px,pz,8]);                 // 中央の円形の台
  for(let k=-3;k<=3;k++){const rad=4.6*Math.sqrt(1-Math.pow(k/3.6,2));put(1,px,cy+k*1.35,pz,rad,1.4,rad,0,0,0,jit(BR,.04))}   // 球（円盤を重ねる）
  const q=new THREE.Quaternion(),q2=new THREE.Quaternion(),ev=new THREE.Euler(),v=new THREE.Vector3(),ax=new THREE.Vector3(0,1,0);
  for(const[tx,ty,tz,RR]of[[.5,0,.3,11],[1.15,0,-.5,9],[-.4,0,1,7.6]]){                  // 傾いた3つの環（石材を円に並べる。ところどころ欠ける）
    q.setFromEuler(ev.set(tx,ty,tz));const N=Math.round(RR*2.2);
    for(let n=0;n<N;n++){const a=n/N*6.2832;v.set(Math.cos(a)*RR,0,Math.sin(a)*RR).applyQuaternion(q);q2.setFromAxisAngle(ax,-(a+1.5708)).premultiply(q);ev.setFromQuaternion(q2);
      if(r()<.93)put(0,px+v.x,cy+v.y,pz+v.z,6.283*RR/N*1.08,1.5,1.7,ev.x,ev.y,ev.z,jit(RG))}}
  for(let k=0;k<20;k++){const a=r()*6.283,d=8+16*r(),s=.5+1.3*r();put(0,px+Math.cos(a)*d,cy-10+24*r(),pz+Math.sin(a)*d,s,s*.8,s,r()*3,r()*3,r()*3,jit(ST))}   // 浮かぶ破片
  for(let n=0;n<9;n++){const a=n*.698+(r()-.5)*.4,d=17+16*r(),x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d,h=6+7*r(),w=1.8+r();put(0,x,H(x,z)+h/2-1,z,w,h,w,(r()-.5)*.25,r()*3,(r()-.5)*.25,jit(ST));C.push([x,z,w*.75])}   // 立石
  for(let n=0;n<6;n++){const a=r()*6.283,d=12+22*r(),bx=px+Math.cos(a)*d,bz=pz+Math.sin(a)*d;C.push([bx,bz,2.6]);
    for(let k=0;k<4;k++){const x=bx+(r()-.5)*5,z=bz+(r()-.5)*5,s=2+2*r();put(0,x,H(x,z)+s*.35-.3,z,s*(.8+.5*r()),s*.7,s*(.8+.5*r()),(r()-.5)*.4,r()*3,(r()-.5)*.4,jit(ST))}}   // 崩れた石材
  return{x:px,z:pz,R:MTR_R,P,C:[],B:ruinSolids(P)};
}
function mtRuinSite(i,j){
  const key=i+','+j;if(mtRuinCache.has(key))return mtRuinCache.get(key);
  let S=null;const r=mulberry(hash(i,j,SEED+8900)*1e9|0);
  if(r()<.45)for(let t=0;t<8&&!S;t++){
    const px=(i+.1+.8*r())*MTR_C,pz=(j+.1+.8*r())*MTR_C,mt=mtBump(px,pz);
    if(mt<=0||mt<mtTL(px,pz))continue;                              // 森林限界より上だけ
    let lo=1e9,hi=-1e9,good=true;
    for(let k=0;k<9&&good;k++){const a=k*.785,d=k?26:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d,h=heightAt(x,z);good=h>WATER+3&&townW(x,z)===0&&riverEff(x,z)>=8;lo=Math.min(lo,h);hi=Math.max(hi,h)}
    if(good&&hi-lo<16)S=mtRuinBuild(px,pz,r);
  }
  mtRuinCache.set(key,S);return S;
}
function ruinMesh(g,geos,circ,cx,cz){                              // このチャンクにある遺跡の石材を1つのメッシュにまとめる
  const x0=cx*CHUNK,x1=x0+CHUNK,z0=cz*CHUNK,z1=z0+CHUNK,pos=[],nor=[],cl=[];
  const m=new THREE.Matrix4(),nm=new THREE.Matrix3(),q=new THREE.Quaternion(),e=new THREE.Euler(),p=new THREE.Vector3(),s=new THREE.Vector3(),v=new THREE.Vector3();
  for(const[SF,SC,SR]of[[ruinSite,RUIN_C,RUIN_R],[mtRuinSite,MTR_C,MTR_R]])for(let i=Math.floor((x0-SR)/SC);i<=Math.floor((x1+SR)/SC);i++)for(let j=Math.floor((z0-SR)/SC);j<=Math.floor((z1+SR)/SC);j++){
    const S=SF(i,j);if(!S)continue;
    for(const a of S.P){
      if(a[1]<x0||a[1]>=x1||a[3]<z0||a[3]>=z1)continue;
      e.set(a[7],a[8],a[9]);q.setFromEuler(e);p.set(a[1],a[2],a[3]);s.set(a[4],a[5],a[6]);m.compose(p,q,s);nm.getNormalMatrix(m);
      const B=a[0]?RB_CYL:RB_BOX,pa=B.attributes.position,na=B.attributes.normal,c=a[10];
      for(let k=0;k<pa.count;k++){
        v.fromBufferAttribute(pa,k).applyMatrix4(m);pos.push(v.x,v.y,v.z);
        v.fromBufferAttribute(na,k).applyMatrix3(nm).normalize();nor.push(v.x,v.y,v.z);
        cl.push(c[0],c[1],c[2]);
      }
    }
    for(const c of S.C)if(c[0]>=x0&&c[0]<x1&&c[1]>=z0&&c[1]<z1)circ.push(c);
  }
  if(!pos.length)return;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));
  geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,RUIN_M);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);geos.push(geo);
}

// ---------- 空中の遺跡（浮遊島。地面からも見える高さ。草と蔦の島に、列柱・アーチ・緑のドームの神殿が載る） ----------
// 480m四方のセルごとに、確率で1か所。プレイヤーの近く(SKR)だけ作る。チャンクとは独立（霧の影響は受ける）
const SK_M=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),SK_T={b:0,c:1,k:2,s:3};
const SK_G={b:new THREE.BoxGeometry(1,1,1).toNonIndexed(),c:new THREE.CylinderGeometry(1,1,1,10).toNonIndexed(),k:new THREE.ConeGeometry(1,1,8).toNonIndexed(),s:new THREE.SphereGeometry(1,12,8,0,6.2832,0,1.5708).toNonIndexed()};
function skySite(i,j){const r=mulberry(hash(i,j,SEED+9100)*1e9|0);if(r()>.6)return null;const x=(i+.2+.6*r())*SKC,z=(j+.2+.6*r())*SKC,t=r()<.5?1:0,y=70+35*r()+(t?15:0),mR=t?13+4*r():26+8*r();return{x,z,y,type:t,mR,seed:(r()*1e9)|0}}
function buildSky(S){
  const r=mulberry(S.seed),rects=[],circs=[],sol=[],pos=[],cl=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),p=new THREE.Vector3(),s=new THREE.Vector3(),v=new THREE.Vector3();
  const jit=(c,a=.08)=>{const t=1+(r()-.5)*2*a;return[c[0]*t,c[1]*t,c[2]*t]};
  const GR=[.3,.52,.2],DIRT=[.55,.38,.26],ROCK=[.46,.45,.45],STONE=[.8,.79,.76],COP=[.36,.64,.5],VINE=[.2,.42,.16],WOOD=[.38,.26,.16];
  const part=(k,x,y,z,sx,sy,sz,ry,col,rx=0,rz=0,nc=0)=>{if(!nc)pieceSolids(sol,SK_T[k],x,y,z,sx,sy,sz,rx,ry,rz);e.set(rx,ry,rz);q.setFromEuler(e);p.set(x,y,z);s.set(sx,sy,sz);m.compose(p,q,s);const pa=SK_G[k].attributes.position;for(let n=0;n<pa.count;n++){v.fromBufferAttribute(pa,n).applyMatrix4(m);pos.push(v.x,v.y,v.z);cl.push(col[0],col[1],col[2])}};
  const tri=(a,b,c,col)=>{for(const w of[a,b,c]){pos.push(w[0],w[1],w[2]);cl.push(col[0],col[1],col[2])}};
  const pil=(x,y,z,rad)=>{};   // 柱・幹の当たり判定（その高さに立っている時だけ）
  const tree=(x,y,z,h)=>{pil(x,y,z,.45);part('c',x,y+h/2,z,.3,h,.3,0,WOOD);part('k',x,y+h+1.2,z,1.8,3.2,1.8,0,jit(VINE,.15));part('k',x,y+h+3,z,1.3,2.6,1.3,0,jit(VINE,.15))};
  const colm=(x,y,z,h,rad=.5)=>{part('c',x,y+h/2,z,rad,h,rad,0,jit(STONE));part('b',x,y+h,z,rad*2.4,.4,rad*2.4,0,jit(STONE));pil(x,y,z,rad+.1)};
  const gazebo=(x,y,z,R)=>{part('c',x,y-.4,z,R+1,.8,R+1,0,jit(STONE));for(let n=0;n<10;n++){const a=n*.6283;colm(x+Math.cos(a)*R,y,z+Math.sin(a)*R,r()<.2?2.5:5,.35)}part('c',x,y+.1,z,R-1,.2,R-1,0,[.45,.62,.8])};
  const island=(cx,cy,cz,R,D,top)=>{                               // 逆円錐の島: 上面の緑・縁の草・茶色の土・灰色の岩
    const N=14,L=7,ring=[];

    for(let k=0;k<=L;k++){const t=k/L,rr=[];for(let n=0;n<N;n++){const a=n/N*6.2832,f=k==L?0:(1-Math.pow(t,1.1))*(.8+.35*r());rr.push([cx+Math.cos(a)*R*f,cy-(k?D*Math.pow(t,.85)*(1+.14*(r()-.5)):0),cz+Math.sin(a)*R*f])}ring.push(rr)}
    {const dy=.5;let hmin=1e9;for(const rr of ring)for(const p of rr)hmin=Math.min(hmin,p[1]);        // 島の胴体（逆円錐）の当たり判定: 上面から先端まで0.5mごとの水平な輪切り。断面は見た目の面（各子午線の折れ線）と同じ形の多角形（いちばん上の層＝上面に立てる）
      const cross=h=>{const Q=[];for(let n=0;n<N;n++){let pt=[cx,cz];for(let k=0;k<L;k++){const a=ring[k][n],b=ring[k+1][n];if(a[1]>=h&&b[1]<h){const t=(a[1]-h)/(a[1]-b[1]);pt=[a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t];break}}Q.push(pt)}return Q};
      for(let y1=cy;y1>hmin+.05;y1-=dy){const y0=Math.max(hmin,y1-dy),P=cross(y1===cy?cy-.02:(y0+y1)/2);
        let A=0;for(let i=0,j=N-1;i<N;j=i++)A+=P[j][0]*P[i][1]-P[i][0]*P[j][1];if(Math.abs(A)<.5)continue;
        let rr=0;for(const p of P)rr=Math.max(rr,Math.hypot(p[0]-cx,p[1]-cz));sol.push({k:2,x:cx,z:cz,pts:P,r:rr,bot:y0,top:y1})}}
    for(let n=0;n<N;n++){const n2=(n+1)%N;tri([cx,cy,cz],ring[0][n],ring[0][n2],jit(GR,.12));
      for(let k=0;k<L;k++){const col=jit(k==0?GR:k<3?DIRT:ROCK,.1);tri(ring[k][n],ring[k+1][n],ring[k][n2],col);tri(ring[k][n2],ring[k+1][n],ring[k+1][n2],col)}
      if(r()<.65){const len=4+14*r(),[x,y,z]=ring[0][n];part('b',x,y-len/2,z,.6,len,.6,0,jit(VINE,.2),0,0,1)}}
    top(cx,cy,cz,R)};
  const bu=(x,y,z,sx,sy,sz,ry=0)=>{part('b',x,y+sy/2,z,sx,sy,sz,ry,jit(STONE))};   // 箱の当たり判定（下をくぐれる: bot）
  // タイプ2: 浮かぶ石の塔（てっぺんに大樹）と、まわりに浮かぶ遺跡の破片・崩れた塔・輪の欠片・小島
  const typeB=()=>{
    const R=S.mR;
    island(S.x,S.y,S.z,R,55,(cx,cy,cz)=>{
      bu(cx,cy,cz,11,20,11);
      for(const[dx,dz]of[[1,1],[1,-1],[-1,1],[-1,-1]]){const x=cx+dx*5.5,z=cz+dz*5.5;part('c',x,cy+12,z,1.6,24,1.6,0,jit(STONE));part('k',x,cy+26,z,2.1,4.5,2.1,0,jit(ROCK));pil(x,cy,z,1.7)}
      part('c',cx,cy+24,cz,.9,8,.9,0,WOOD);part('s',cx,cy+27,cz,9,5,9,0,jit(VINE,.1));part('s',cx,cy+30.5,cz,6.5,5,6.5,0,jit(VINE,.1));part('s',cx,cy+34,cz,4,4,4,0,jit(VINE,.1))});
    const at=(d0,d1)=>{const a=r()*6.2832,d=R+d0+d1*r();return[S.x+Math.cos(a)*d,S.z+Math.sin(a)*d,a]};
    for(let k=0;k<22;k++){const[x,z]=at(8,60),y=S.y-35+75*r(),b=1.2+4*r()*r()*2;part('b',x,y,z,b*(.7+.6*r()),b*(.7+.8*r()),b*(.7+.6*r()),r()*3,jit(r()<.6?STONE:ROCK,.12),(r()-.5)*1.2,(r()-.5)*1.2)}   // 浮かぶ石材
    for(let k=0;k<3;k++){const[x,z]=at(14,34),y=S.y-25+45*r();part('b',x,y,z,5,13,5,r()*3,jit(STONE),(r()-.5)*1.4,(r()-.5)*1.4);part('b',x+1.2,y+7.2,z,1.6,1.6,1.6,0,jit(STONE))}   // 崩れた塔の破片
    for(let k=0;k<2;k++){const[x,z]=at(16,30),y=S.y-15+35*r(),a0=r()*6.28;for(let n=0;n<7;n++){const a=a0+n*.55;part('b',x+Math.cos(a)*5,y,z+Math.sin(a)*5,2.2,2.4,1.6,-a-1.5708,jit(STONE))}}   // 輪の欠片
    {const[x,z]=at(26,16),cy=S.y-8+16*r();island(x,cy,z,9,18,(cx,cy,cz)=>gazebo(cx,cy,cz,5))}
    {const[x,z]=at(26,16),cy=S.y-8+16*r();island(x,cy,z,10,16,(cx,cy,cz)=>{tree(cx+3.5,cy,cz+2,4);part('b',cx-2,cy+6,cz,4.5,12,4.5,0,jit(STONE),0,.35);pil(cx-2,cy,cz,2.4)})}
  };
  if(S.type===1)typeB();else{
  // 主島: 神殿（基壇・列柱・四方のアーチ・ドーム・四隅の尖塔）
  const mR=S.mR;
  island(S.x,S.y,S.z,mR,45+15*r(),(cx,cy,cz)=>{
    bu(cx,cy,cz,22,.5,22);const y0=cy+.5;
    for(let n=0;n<12;n++){const a=n*.5236;if(r()<.85)colm(cx+Math.cos(a)*10,y0,cz+Math.sin(a)*10,r()<.25?3:6.5,.5)}
    bu(cx,y0,cz,9,8,9);
    for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const px=cx+dx*5.5,pz=cz+dz*5.5,ox=-dz*2.6,oz=dx*2.6;colm(px+ox,y0,pz+oz,7,.5);colm(px-ox,y0,pz-oz,7,.5);bu(px,y0+7,pz,dz?5.6:1.3,1.1,dx?5.6:1.3,0,y0+7)}
    part('c',cx,y0+9.5,cz,4,3,4,0,jit(STONE));part('s',cx,y0+11,cz,4.6,5.2,4.6,0,COP);part('k',cx,y0+17.4,cz,.5,3.2,.5,0,COP);
    for(const[dx,dz]of[[1,1],[1,-1],[-1,1],[-1,-1]]){const x=cx+dx*8,z=cz+dz*8;part('c',x,y0+5,z,1.1,10,1.1,0,jit(STONE));pil(x,y0,z,1.2);part('k',x,y0+12,z,1.7,4,1.7,0,COP)}
    for(let n=0;n<4;n++){const a=r()*6.28,d=14+(mR-16)*r();if(d<mR-4)tree(cx+Math.cos(a)*d,cy,cz+Math.sin(a)*d,3+2*r())}});
  // まわりの小島: 木・円形の東屋・崩れた柱
  const n=3+Math.floor(3*r()),a0=r()*6.28;
  for(let k=0;k<n;k++){const a=a0+k*6.2832/n+(r()-.5)*.5,d=mR+22+36*r(),R=7+9*r(),cy=S.y+(r()-.5)*36,x=S.x+Math.cos(a)*d,z=S.z+Math.sin(a)*d,kind=r();
    island(x,cy,z,R,16+22*r(),(cx,cy,cz,R)=>{
      if(kind<.35)gazebo(cx,cy,cz,Math.min(5,R*.6));
      else if(kind<.7){tree(cx+2,cy,cz,4+2*r());tree(cx-R*.35,cy,cz+R*.3,3+2*r());colm(cx,cy,cz-R*.3,r()<.5?3:5,.5)}
      else{bu(cx,cy,cz,R*.7,2.5,R*.7,r());tree(cx+R*.4,cy,cz,4)}});
  }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,SK_M);mesh.userData.x=S.x;mesh.userData.z=S.z;mesh.userData.rects=rects;mesh.userData.circs=circs;mesh.userData.sol=sol;return mesh;
}
function skyReset(){for(const o of skyCache.values()){scene.remove(o);o.geometry.dispose()}skyCache.clear()}
function updateSkyRuins(){
  const i0=Math.floor(player.x/SKC),j0=Math.floor(player.z/SKC);
  for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++){const k=i+','+j;if(skyCache.has(k))continue;const S=skySite(i,j);if(!S||Math.hypot(S.x-player.x,S.z-player.z)>SKR)continue;const o=buildSky(S);skyCache.set(k,o);scene.add(o)}
  for(const[k,o]of skyCache)if(Math.hypot(o.userData.x-player.x,o.userData.z-player.z)>SKR+80){scene.remove(o);o.geometry.dispose();skyCache.delete(k)}
}

// ---------- 火の汚染（ほぼ砂漠に、ランダムに）。地面のあちこちから炎が噴き出し、まわりの地面が赤く焼けている ----------
// 3600m四方のセルごとに、気候が砂漠に近いほど高い確率で1か所できる（半径FIRE_R0〜FIRE_R1=バイオーム規模の焼け野原）。街・村・集落は中央の穴の周りだけ避ける。汚染同士は重なってよい（火と氷だけは重ならない）。
// 炎が出るのは中央付近(R*FIRE_CORE)に開けた穴だけ（全域に出すと重いため）。穴=黒い円に溶岩色の縁。
// 炎=加算合成の板（ドット絵ではなく柔らかい炎）が揺らぎ、火の粉が舞い上がる。赤い地面は頂点色。範囲内の木と岩は残し、色だけ黒く焦がす（pollTint）。
const fireD=(S,x,z)=>Math.hypot(x-S.x+70*Math.sin(z*.0043+S.ph),z-S.z+70*Math.sin(x*.0051+S.ph*1.7));   // 縁がゆるく波打つ距離（バイオームの境目のように）
function fireSite(i,j){
  const key=i*100003+j;if(fireCache.has(key))return fireCache.get(key);
  let S=null;
  const r=mulberry(hash(i,j,SEED+7771)*1e9|0);
  const px=(i+.25+.5*r())*FIRE_C,pz=(j+.25+.5*r())*FIRE_C,R=FIRE_R0+(FIRE_R1-FIRE_R0)*r(),pr=r(),ph=r()*6.283,RC=R*FIRE_CORE;
  if(pr<.008+.85*Math.pow(climateAt(px,pz).de,2)){
    let good=true;                                                 // 街・集落との重なりは、炎と穴が出る中央だけ避ける（広い焼け野原には街があってもよい）
    for(let k=0;k<9&&good;k++){
      const a=k*.785,d=k?RC*.9:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d,h=heightAt(x,z);
      good=h>WATER+1&&townW(x,z)===0&&villageDist(x,z)>=60&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z);
    }
    if(good){
      const V=[],nv=14+Math.floor(10*r());                         // 中央付近の穴: 中心に大きな穴と火柱、まわりに小さな穴（炎はここからだけ出る）
      V.push({u:0,v:0,n:9+Math.floor(5*r()),hm:11+7*r(),rad:9});
      for(let k=0;k<nv;k++){const a=r()*6.283,d=RC*(.2+.8*Math.sqrt(r())),n=2+Math.floor(4*r()),hm=3+5*r(),rad=2+2*r();if(heightAt(px+Math.cos(a)*d,pz+Math.sin(a)*d)>WATER+1)V.push({u:Math.cos(a)*d,v:Math.sin(a)*d,n,hm,rad})}
      S={x:px,z:pz,R,V,ph};
    }
  }
  fireCache.set(key,S);return S;
}
function fireNear(x,z){                                            // 地面の色用: 赤く焼ける範囲(R*1.25)の中なら、その汚染（セルの端から112m以上内側にあるので、自分のセルだけ見ればよい）
  const S=fireSite(Math.floor(x/FIRE_C),Math.floor(z/FIRE_C));
  return S&&fireD(S,x,z)<S.R*1.25?S:null;
}
function fireClear(x,z){const S=fireSite(Math.floor(x/FIRE_C),Math.floor(z/FIRE_C));return !!S&&Math.hypot(x-S.x,z-S.z)<S.R*FIRE_CORE*1.15}   // 家などを置かないのは炎と穴のある中央だけ
function fireTint(c,f,x,z){
  const d=fireD(f,x,z),R=f.R,t=1-sm01(R*.4,R*1.25,d);if(t<=.01)return c;
  const n=.5+.5*Math.sin(x*.11+Math.sin(z*.083)*2.1)*Math.sin(z*.13+Math.sin(x*.071)*1.7),q=sm01(R*.1,R*.9,d);
  let r=.14+(.58-.14)*q,g=.05+(.12-.05)*q,b=.04+(.07-.04)*q;      // 中心ほど黒く焦げ、外へ向かって赤くなる
  if(d<R*.8&&n>.7){const m=Math.min(1,(n-.7)/.2)*(1-d/(R*.8));r+=(.95-r)*m;g+=(.38-g)*m;b+=(.08-b)*m}   // ところどころ熱く光る橙の筋
  return[c[0]+(r-c[0])*t,c[1]+(g-c[1])*t,c[2]+(b-c[2])*t];
}
const fireGroups=new Map();
let FIRE_TEX=null,EMBER_TEX=null,FIRE_MATS=null,HOLE_MAT=null,HOLE_GEO=null;
function fireInit(){
  if(FIRE_TEX)return;
  let c=document.createElement('canvas');c.width=64;c.height=128;let g=c.getContext('2d');       // 炎のしずくの形（下が明るい黄、上へ橙→赤→透明）
  const gr=g.createLinearGradient(0,126,0,4);gr.addColorStop(0,'rgba(255,245,170,1)');gr.addColorStop(.3,'rgba(255,190,60,.95)');gr.addColorStop(.65,'rgba(255,90,20,.75)');gr.addColorStop(1,'rgba(160,20,0,0)');
  g.shadowColor='rgba(255,120,30,.9)';g.shadowBlur=9;g.fillStyle=gr;
  g.beginPath();g.moveTo(32,120);g.bezierCurveTo(6,98,12,56,32,8);g.bezierCurveTo(52,56,58,98,32,120);g.fill();
  FIRE_TEX=new THREE.CanvasTexture(c);
  c=document.createElement('canvas');c.width=c.height=32;g=c.getContext('2d');
  const rg=g.createRadialGradient(16,16,0,16,16,16);rg.addColorStop(0,'rgba(255,230,150,1)');rg.addColorStop(.4,'rgba(255,120,30,.8)');rg.addColorStop(1,'rgba(255,60,0,0)');g.fillStyle=rg;g.fillRect(0,0,32,32);
  EMBER_TEX=new THREE.CanvasTexture(c);
  c=document.createElement('canvas');c.width=c.height=64;g=c.getContext('2d');                    // 穴: まん中は真っ黒、縁は溶岩の橙に光る
  const hg=g.createRadialGradient(32,32,0,32,32,32);hg.addColorStop(0,'rgba(4,0,0,1)');hg.addColorStop(.55,'rgba(10,2,0,1)');hg.addColorStop(.72,'rgba(255,110,20,.95)');hg.addColorStop(.86,'rgba(150,30,0,.55)');hg.addColorStop(1,'rgba(80,10,0,0)');g.fillStyle=hg;g.fillRect(0,0,64,64);
  HOLE_MAT=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  HOLE_GEO=new THREE.CircleGeometry(1,28);HOLE_GEO.rotateX(-Math.PI/2);
  FIRE_MATS=[0xffffff,0xffcf9a,0xff9a66].map(col=>new THREE.SpriteMaterial({map:FIRE_TEX,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
}
function fireMake(S){
  fireInit();
  const g=new THREE.Group(),fl=[];
  for(const v of S.V){
    const wx=S.x+v.u,wz=S.z+v.v,gy=heightAt(wx,wz);
    {const q=v.rad*.8,hy=Math.max(gy,heightAt(wx+q,wz),heightAt(wx-q,wz),heightAt(wx,wz+q),heightAt(wx,wz-q)),hm=new THREE.Mesh(HOLE_GEO,HOLE_MAT);   // 斜面でもめり込まないよう、まわりの一番高い所に合わせて地面に貼る
     hm.position.set(wx,hy+.12,wz);hm.scale.set(v.rad*1.5,1,v.rad*1.5);hm.renderOrder=1;g.add(hm)}
    for(let k=0;k<v.n;k++){
      const sp=new THREE.Sprite(FIRE_MATS[Math.floor(Math.random()*3)]);
      sp.center.set(.5,0);
      const h=v.hm*(.45+.55*Math.random()),ox=(Math.random()-.5)*(v.hm>9?3.5:1.6),oz=(Math.random()-.5)*(v.hm>9?3.5:1.6);
      sp.position.set(wx+ox,gy-.2,wz+oz);sp.scale.set(h*.55,h,1);
      sp.userData={h,ph:Math.random()*6.283,f:3+4*Math.random(),sw:.15+.2*Math.random()};
      g.add(sp);fl.push(sp);
    }
  }
  const NE=140,pos=new Float32Array(NE*3),vel=new Float32Array(NE*3);                              // 火の粉
  const ember=(i,init)=>{const v=S.V[Math.floor(Math.random()*S.V.length)];pos[i*3]=S.x+v.u+(Math.random()-.5)*3;pos[i*3+2]=S.z+v.v+(Math.random()-.5)*3;pos[i*3+1]=heightAt(pos[i*3],pos[i*3+2])+(init?Math.random()*20:.5);vel[i*3]=(Math.random()-.5)*1.5;vel[i*3+1]=3+5*Math.random();vel[i*3+2]=(Math.random()-.5)*1.5};
  for(let i=0;i<NE;i++)ember(i,true);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({map:EMBER_TEX,size:.9,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,color:0xffb060}));
  pts.frustumCulled=false;g.add(pts);
  g.userData={fl,pos,vel,geo,ember,S};
  return g;
}
function updateFires(){                                            // プレイヤーが中央の穴の近く(650m以内)に来た汚染だけ炎を出す（赤い地面は範囲全体に常にある）
  const ix=Math.floor(player.x/FIRE_C),iz=Math.floor(player.z/FIRE_C),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const S=fireSite(ix+a,iz+b);if(!S)continue;
    const d=Math.hypot(S.x-player.x,S.z-player.z),key=(ix+a)+','+(iz+b);
    if(d<650||(d<750&&fireGroups.has(key))){keep.add(key);if(!fireGroups.has(key)){const g=fireMake(S);scene.add(g);fireGroups.set(key,g)}}
  }
  for(const[k,g] of fireGroups)if(!keep.has(k)){scene.remove(g);g.userData.geo.dispose();fireGroups.delete(k)}
}
function clearFires(){for(const g of fireGroups.values()){scene.remove(g);g.userData.geo.dispose()}fireGroups.clear()}
function fireAnimate(t,dt){
  for(const g of fireGroups.values()){
    for(const sp of g.userData.fl){const u=sp.userData,k=1+.28*Math.sin(t*u.f+u.ph)+.12*Math.sin(t*u.f*2.3+u.ph*1.7);sp.scale.set(u.h*.55*(2-k)*.8,u.h*k,1)}
    const {pos,vel,geo,ember}=g.userData,n=pos.length/3;
    for(let i=0;i<n;i++){pos[i*3]+=vel[i*3]*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;if(pos[i*3+1]-heightAt(pos[i*3],pos[i*3+2])>26)ember(i,false)}
    geo.attributes.position.needsUpdate=true;
  }
}
// ---------- 氷の汚染（ほぼ雪原に、ランダムに）。地面から氷の水晶が突き出し、まわりの地面が青く凍っている ----------
// 3600m四方のセルごとに、気候が雪原・氷河に近いほど高い確率で1か所できる（半径ICE_R0〜ICE_R1=バイオーム規模の凍土）。街・村・集落は中央の水晶の周りだけ避ける。汚染同士は重なってよい（火と氷だけは重ならない）。
// 水晶=六角柱＋とがった先（外へ傾いた大小の束）。水晶が立つのは中央付近(R*ICE_CORE)だけ（全域に出すと重いため）。青い地面は頂点色で範囲全体にある。範囲内の木と岩は残し、色だけ青く凍らせる（pollTint）。水晶はゆっくり青白く脈打ち、氷の粒がふわふわ舞い上がる。
const iceD=(S,x,z)=>Math.hypot(x-S.x+70*Math.sin(z*.0045+S.ph),z-S.z+70*Math.sin(x*.0049+S.ph*1.6));   // 縁がゆるく波打つ距離（バイオームの境目のように）
function iceSite(i,j){
  const key=i*100003+j;if(iceCache.has(key))return iceCache.get(key);
  let S=null;
  const r=mulberry(hash(i,j,SEED+7772)*1e9|0);
  const px=(i+.25+.5*r())*ICE_C,pz=(j+.25+.5*r())*ICE_C,R=ICE_R0+(ICE_R1-ICE_R0)*r(),pr=r(),ph=r()*6.283,RC=R*ICE_CORE;
  if(pr<.008+.85*Math.pow(climateAt(px,pz).tu,2)){                 // 雪原(氷河はその奥)ほど高い確率
    let good=true;                                                 // 街・集落との重なりは、水晶が立つ中央だけ避ける（広い凍土には街があってもよい）
    for(let k=0;k<9&&good;k++){
      const a=k*.785,d=k?RC*.9:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d,h=heightAt(x,z);
      good=h>WATER+1&&townW(x,z)===0&&villageDist(x,z)>=60&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z)&&!fireNear(x,z);
    }
    for(let k=0;k<8&&good;k++){const a=k*.785;good=!fireNear(px+Math.cos(a)*R*1.3,pz+Math.sin(a)*R*1.3)}   // 氷の青い範囲(R*1.25)の縁も、火の汚染にかからないこと（火と氷は重ならない）
    if(good){
      const V=[],nv=14+Math.floor(10*r());                          // 水晶の束: 中央に大きな束、そのまわり(中央の範囲内)に小さな束
      V.push({u:0,v:0,n:9+Math.floor(6*r()),hm:18+14*r()});
      for(let k=0;k<nv;k++){const a=r()*6.283,d=RC*(.2+.8*Math.sqrt(r()));if(heightAt(px+Math.cos(a)*d,pz+Math.sin(a)*d)>WATER+1)V.push({u:Math.cos(a)*d,v:Math.sin(a)*d,n:2+Math.floor(4*r()),hm:4+8*r()})}
      S={x:px,z:pz,R,V,ph};
    }
  }
  iceCache.set(key,S);return S;
}
function iceNear(x,z){                                             // 地面の色用: 青く凍る範囲(R*1.25)の中なら、その汚染（セルの端から112m以上内側にあるので、自分のセルだけ見ればよい）
  const S=iceSite(Math.floor(x/ICE_C),Math.floor(z/ICE_C));
  return S&&iceD(S,x,z)<S.R*1.25?S:null;
}
function iceClear(x,z){const S=iceSite(Math.floor(x/ICE_C),Math.floor(z/ICE_C));return !!S&&Math.hypot(x-S.x,z-S.z)<S.R*ICE_CORE*1.15}   // 家などを置かないのは水晶のある中央だけ
function iceTint(c,f,x,z){
  const d=iceD(f,x,z),R=f.R,t=1-sm01(R*.4,R*1.25,d);if(t<=.01)return c;
  const n=.5+.5*Math.sin(x*.12+Math.sin(z*.09)*2.1)*Math.sin(z*.14+Math.sin(x*.07)*1.7),q=sm01(R*.1,R*.9,d);
  let r=.08+(.46-.08)*q,g=.28+(.66-.28)*q,b=.62+(.92-.62)*q;       // 中心ほど濃い青、外へ向かって淡い青
  if(d<R*.8&&n>.7){const m=Math.min(1,(n-.7)/.2)*(1-d/(R*.8));r+=(.74-r)*m;g+=(.94-g)*m;b+=(1-b)*m}   // ところどころ明るい水色の筋
  return[c[0]+(r-c[0])*t,c[1]+(g-c[1])*t,c[2]+(b-c[2])*t];
}
const iceGroups=new Map();
let ICE_GEO=null,ICE_MAT=null,ICE_DUST_TEX=null;
function iceInit(){
  if(ICE_GEO)return;
  const A=Math.PI/3,P=[],ap=[0,1,0];                                // 水晶1本: 底(y=0,半径1)・肩(y=.78,半径1)・先(y=1)。幅=半径、高さ=1のまま拡大して使う
  const ring=(k,y)=>[Math.cos(k*A),y,Math.sin(k*A)];
  for(let k=0;k<6;k++){
    const b0=ring(k,0),b1=ring(k+1,0),s0=ring(k,.78),s1=ring(k+1,.78);
    P.push(...b0,...s1,...b1, ...b0,...s0,...s1, ...s0,...ap,...s1);
  }
  ICE_GEO=new THREE.BufferGeometry();ICE_GEO.setAttribute('position',new THREE.Float32BufferAttribute(P,3));ICE_GEO.computeVertexNormals();
  ICE_MAT=new THREE.MeshPhongMaterial({color:0xffffff,specular:0xcfeeff,shininess:90,emissive:0x1d5a9a,emissiveIntensity:.45,transparent:true,opacity:.9});
  const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');
  const rg=g.createRadialGradient(16,16,0,16,16,16);rg.addColorStop(0,'rgba(240,250,255,1)');rg.addColorStop(.4,'rgba(150,210,255,.7)');rg.addColorStop(1,'rgba(100,180,255,0)');g.fillStyle=rg;g.fillRect(0,0,32,32);
  ICE_DUST_TEX=new THREE.CanvasTexture(c);
}
function iceMake(S){
  iceInit();
  const rng=mulberry(hash(Math.round(S.x),Math.round(S.z),SEED+7773)*1e9|0),g=new THREE.Group(),L=[];
  for(const v of S.V){
    const wx=S.x+v.u,wz=S.z+v.v,sp=v.hm>9?3.8:1.8;
    for(let k=0;k<v.n;k++){
      const ox=k?(rng()-.5)*2*sp:0,oz=k?(rng()-.5)*2*sp:0,x=wx+ox,z=wz+oz;
      const h=v.hm*(k?.35+.65*rng():1),w=h*(.1+.09*rng()),th=k?.12+.45*rng():.05*rng(),ph=Math.atan2(oz,ox)+(rng()-.5)*.8;   // 外へ傾ける（中心の1本はほぼ垂直）
      L.push({x,y:heightAt(x,z)-.4,z,w,h,rx:th*Math.sin(ph),rz:-th*Math.cos(ph),t:rng()});
    }
  }
  const m=new THREE.InstancedMesh(ICE_GEO,ICE_MAT,L.length),d=new THREE.Object3D(),col=new THREE.Color();
  L.forEach((o,i)=>{d.position.set(o.x,o.y,o.z);d.rotation.set(o.rx,0,o.rz);d.scale.set(o.w,o.h,o.w);d.updateMatrix();m.setMatrixAt(i,d.matrix);
    col.setRGB(.62+.22*o.t,.84+.12*o.t,1);m.setColorAt(i,col)});                       // 淡い水色〜白っぽい青
  m.frustumCulled=false;m.castShadow=true;g.add(m);
  const NE=110,pos=new Float32Array(NE*3),vel=new Float32Array(NE*3);                  // 舞い上がる氷の粒
  const dust=(i,init)=>{const v=S.V[Math.floor(rng()*S.V.length)];pos[i*3]=S.x+v.u+(rng()-.5)*6;pos[i*3+2]=S.z+v.v+(rng()-.5)*6;pos[i*3+1]=heightAt(pos[i*3],pos[i*3+2])+(init?rng()*22:.5);vel[i*3]=(rng()-.5)*1.2;vel[i*3+1]=1+2*rng();vel[i*3+2]=(rng()-.5)*1.2};
  for(let i=0;i<NE;i++)dust(i,true);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({map:ICE_DUST_TEX,size:.8,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,color:0xd8f0ff}));
  pts.frustumCulled=false;g.add(pts);
  g.userData={pos,vel,geo,dust,mesh:m};
  return g;
}
function iceDispose(g){g.userData.geo.dispose();g.userData.mesh.dispose()}
function updateIces(){                                             // プレイヤーが中央の水晶の近く(650m以内)に来た汚染だけ水晶を出す（青い地面は範囲全体に常にある）
  const ix=Math.floor(player.x/ICE_C),iz=Math.floor(player.z/ICE_C),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const S=iceSite(ix+a,iz+b);if(!S)continue;
    const d=Math.hypot(S.x-player.x,S.z-player.z),key=(ix+a)+','+(iz+b);
    if(d<650||(d<750&&iceGroups.has(key))){keep.add(key);if(!iceGroups.has(key)){const g=iceMake(S);scene.add(g);iceGroups.set(key,g)}}
  }
  for(const[k,g] of iceGroups)if(!keep.has(k)){scene.remove(g);iceDispose(g);iceGroups.delete(k)}
}
function clearIces(){for(const g of iceGroups.values()){scene.remove(g);iceDispose(g)}iceGroups.clear()}
function iceAnimate(t,dt){
  if(ICE_MAT)ICE_MAT.emissiveIntensity=.42+.16*Math.sin(t*1.6)+.06*Math.sin(t*4.1);   // ゆっくり青白く脈打つ
  for(const g of iceGroups.values()){
    const {pos,vel,geo,dust}=g.userData,n=pos.length/3;
    for(let i=0;i<n;i++){pos[i*3]+=vel[i*3]*dt+Math.sin(t*.8+i)*.4*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;if(pos[i*3+1]-heightAt(pos[i*3],pos[i*3+2])>26)dust(i,false)}
    geo.attributes.position.needsUpdate=true;
  }
}
// ---------- 雷の汚染（高い所にできやすい）。地面や空気中に小さな稲妻がぱちぱち走り、まわりの地面が黒ずんでいる ----------
// 450m四方のセルごとに、標高が高いほど（台地の上・山など）高い確率で1か所できる（半径THU_R0〜THU_R1）。街・村・集落とは重ならない。汚染同士は重なってよい（火と氷だけは重ならない）。地形・森・遺跡には関係なく置く。
// 稲妻=ぎざぎざの短い線（地面を這う・空中を走る・地面から空へ伸びる）が一瞬光って消える。端は黄白色にぼうっと光る。黒ずんだ地面は頂点色。範囲内の木と岩は残し、色だけ黒ずませる（pollTint）。
function thuSite(i,j){
  const key=i*100003+j;if(thuCache.has(key))return thuCache.get(key);
  let S=null;
  const r=mulberry(hash(i,j,SEED+7774)*1e9|0);
  const px=(i+.25+.5*r())*THU_C,pz=(j+.25+.5*r())*THU_C,R=THU_R0+(THU_R1-THU_R0)*r(),pr=r();
  if(pr<.003+.32*sm01(25,95,heightAt(px,pz))){                       // 平地はまれ。標高25〜95mで確率が上がる
    let good=true,lo=1e9,hi=-1e9;
    for(let k=0;k<9&&good;k++){
      const a=k*.785,d=k?R*.9:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d,h=heightAt(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h);
      good=townW(x,z)===0&&villageDist(x,z)>=60&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z);
    }
    if(good)S={x:px,z:pz,R};                                        // 地形・森・遺跡には関係なく置く（出やすさは標高だけ）
  }
  thuCache.set(key,S);return S;
}
function thuNear(x,z){                                             // 地面の色用: 黒ずむ範囲(R*1.25)の中なら、その汚染（セルの端から112m以上内側にあるので、自分のセルだけ見ればよい）
  const S=thuSite(Math.floor(x/THU_C),Math.floor(z/THU_C));
  return S&&Math.hypot(x-S.x,z-S.z)<S.R*1.25?S:null;
}
function thuClear(x,z){const S=thuSite(Math.floor(x/THU_C),Math.floor(z/THU_C));return !!S&&Math.hypot(x-S.x,z-S.z)<S.R*1.05}
function thuTint(c,f,x,z){
  const d=Math.hypot(x-f.x,z-f.z),R=f.R,t=1-sm01(R*.4,R*1.25,d);if(t<=.01)return c;
  const n=.5+.5*Math.sin(x*.13+Math.sin(z*.1)*2.3)*Math.sin(z*.15+Math.sin(x*.08)*1.9),q=sm01(R*.1,R*.9,d);
  let r=.16+(.45-.16)*q,g=.15+(.44-.15)*q,b=.21+(.5-.21)*q;        // 中心ほど黒く焼け、外へ向かって灰紫
  if(d<R*.8&&n>.72){const m=Math.min(1,(n-.72)/.2)*(1-d/(R*.8));r+=(.98-r)*m;g+=(.92-g)*m;b+=(.5-b)*m}   // ところどころ黄白色に焼けた筋（雷で溶けた跡）
  return[c[0]+(r-c[0])*t,c[1]+(g-c[1])*t,c[2]+(b-c[2])*t];
}
const thuGroups=new Map();
let THU_GLOW_TEX=null;
function thuMake(S){
  if(!THU_GLOW_TEX){
    const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');
    const rg=g.createRadialGradient(16,16,0,16,16,16);rg.addColorStop(0,'rgba(255,255,235,1)');rg.addColorStop(.35,'rgba(255,235,140,.7)');rg.addColorStop(1,'rgba(255,200,60,0)');g.fillStyle=rg;g.fillRect(0,0,32,32);
    THU_GLOW_TEX=new THREE.CanvasTexture(c);
  }
  const g=new THREE.Group(),pos=new Float32Array(THU_N*THU_SEG*6),gpos=new Float32Array(THU_N*3);
  for(let k=0;k<THU_N;k++)thuHide(S,k,pos,gpos);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.LineBasicMaterial({color:0xe6f2ff,blending:THREE.AdditiveBlending,transparent:true,opacity:1,depthWrite:false});
  const lines=new THREE.LineSegments(geo,mat);lines.frustumCulled=false;g.add(lines);
  const ggeo=new THREE.BufferGeometry();ggeo.setAttribute('position',new THREE.BufferAttribute(gpos,3));
  const glow=new THREE.Points(ggeo,new THREE.PointsMaterial({map:THU_GLOW_TEX,size:2.4,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,color:0xfff0b0}));
  glow.frustumCulled=false;g.add(glow);
  const slots=[];for(let k=0;k<THU_N;k++)slots.push({on:false,t:Math.random()*1.2});   // t=次に変わるまでの秒数
  g.userData={S,pos,gpos,geo,ggeo,mat,slots};
  return g;
}
function thuHide(S,k,pos,gpos){                                    // 稲妻k番を消す（長さ0の線にして、光も地下へ）
  for(let i=0;i<THU_SEG*6;i+=3){pos[k*THU_SEG*6+i]=S.x;pos[k*THU_SEG*6+i+1]=-500;pos[k*THU_SEG*6+i+2]=S.z}
  gpos[k*3]=S.x;gpos[k*3+1]=-500;gpos[k*3+2]=S.z;
}
function thuBolt(S,k,pos,gpos){                                    // 稲妻k番を作る: 地面を這う(45%)・空中を走る(35%)・地面から空へ伸びる(20%)
  const R=Math.random,a=R()*6.283,d=S.R*Math.sqrt(R())*.9,cx=S.x+Math.cos(a)*d,cz=S.z+Math.sin(a)*d,gy=heightAt(cx,cz),ty=R();
  let p0,p1,ground=false;
  if(ty<.45){const th=R()*6.283,L=2+4*R();ground=true;p0=[cx,0,cz];p1=[cx+Math.cos(th)*L,0,cz+Math.sin(th)*L]}
  else if(ty<.8){const cy=gy+1.5+12*R(),u=R()*6.283,v=(R()-.5)*1.6,w=Math.sqrt(Math.max(0,1-v*v)),L=(1.5+3.5*R())/2,dx=Math.cos(u)*w*L,dz=Math.sin(u)*w*L,dy=v*L;
    p0=[cx-dx,cy-dy,cz-dz];p1=[cx+dx,cy+dy,cz+dz]}
  else{p0=[cx,gy+.3,cz];p1=[cx+(R()-.5)*2,gy+3+6*R(),cz+(R()-.5)*2]}
  const len=Math.hypot(p1[0]-p0[0],p1[2]-p0[2],ground?0:p1[1]-p0[1]),J=.1+.14*len,pts=[];
  for(let i=0;i<=THU_SEG;i++){
    const u=i/THU_SEG,e=i>0&&i<THU_SEG?1:0;
    const x=p0[0]+(p1[0]-p0[0])*u+(R()-.5)*J*2*e,z=p0[2]+(p1[2]-p0[2])*u+(R()-.5)*J*2*e;
    const y=ground?heightAt(x,z)+.4+.3*R():p0[1]+(p1[1]-p0[1])*u+(R()-.5)*J*2*e;
    pts.push([x,y,z]);
  }
  for(let i=0;i<THU_SEG;i++){const o=(k*THU_SEG+i)*6;pos[o]=pts[i][0];pos[o+1]=pts[i][1];pos[o+2]=pts[i][2];pos[o+3]=pts[i+1][0];pos[o+4]=pts[i+1][1];pos[o+5]=pts[i+1][2]}
  const m=pts[THU_SEG>>1];gpos[k*3]=m[0];gpos[k*3+1]=m[1];gpos[k*3+2]=m[2];
}
function thuDispose(g){g.userData.geo.dispose();g.userData.ggeo.dispose();g.userData.mat.dispose()}
function updateThus(){                                             // プレイヤーの近く(520m以内)の汚染だけ稲妻を出す
  const ix=Math.floor(player.x/THU_C),iz=Math.floor(player.z/THU_C),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const S=thuSite(ix+a,iz+b);if(!S)continue;
    const d=Math.hypot(S.x-player.x,S.z-player.z),key=(ix+a)+','+(iz+b);
    if(d<520||(d<640&&thuGroups.has(key))){keep.add(key);if(!thuGroups.has(key)){const g=thuMake(S);scene.add(g);thuGroups.set(key,g)}}
  }
  for(const[k,g] of thuGroups)if(!keep.has(k)){scene.remove(g);thuDispose(g);thuGroups.delete(k)}
}
function clearThus(){for(const g of thuGroups.values()){scene.remove(g);thuDispose(g)}thuGroups.clear()}
function thuAnimate(t,dt){
  for(const g of thuGroups.values()){
    const {S,pos,gpos,geo,ggeo,mat,slots}=g.userData;let ch=false;
    mat.opacity=.55+.45*Math.random();                              // ちらつき
    for(let k=0;k<THU_N;k++){
      const s=slots[k];s.t-=dt;if(s.t>0)continue;
      if(s.on){thuHide(S,k,pos,gpos);s.on=false;s.t=.05+Math.random()*1.1}                 // 消えて、しばらく休む
      else{thuBolt(S,k,pos,gpos);s.on=true;s.t=.06+Math.random()*.16}                       // 光る時間は短い
      ch=true;
    }
    if(ch){geo.attributes.position.needsUpdate=true;ggeo.attributes.position.needsUpdate=true}
  }
}
// ---------- 闇の汚染（どこにでもまれに、森では少し多め）。辺りが真っ黒になる ----------
// 3600m四方のセルごとに、まれに1か所できる（半径DRK_R0〜DRK_R1=バイオーム規模の黒い土地）。街・村・集落とは範囲全体で重ならない。汚染同士は重なってよい（火と氷だけは重ならない）。地形・森・遺跡には関係なく置く。
// 地面・範囲内の木と岩が真っ黒になり、中央付近(R*DRK_CORE)から黒いもやがゆっくり立ちのぼる。プレイヤーが近づくと空・霧・光も黒くなる（updateEnv）。
const drkD=(S,x,z)=>Math.hypot(x-S.x+70*Math.sin(z*.0044+S.ph),z-S.z+70*Math.sin(x*.0052+S.ph*1.5));   // 縁がゆるく波打つ距離（バイオームの境目のように）
function drkSite(i,j){
  const key=i*100003+j;if(drkCache.has(key))return drkCache.get(key);
  let S=null;
  const r=mulberry(hash(i,j,SEED+7775)*1e9|0);
  const px=(i+.25+.5*r())*DRK_C,pz=(j+.25+.5*r())*DRK_C,R=DRK_R0+(DRK_R1-DRK_R0)*r(),pr=r(),ph=r()*6.283;
  const c=climateAt(px,pz),fo=Math.min(1,c.bf+c.jg+c.tf+c.ta+c.sq);   // すぐ読む（森ほど少し出やすい）
  if(pr<.05+.2*fo){
    let good=true;                                                 // 街・村・集落は黒い範囲全体(R*1.3まで)に入れない: 中心と、3つの輪(R*.5/1.0/1.3)の16方向を調べる
    for(let k=0;k<49&&good;k++){
      const ring=k?1+Math.floor((k-1)/16):0,a=k?((k-1)%16)*.3927+ring*.2:0,d=k?R*(ring===1?.5:ring===2?1:1.3):0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d;
      good=townW(x,z)===0&&villageDist(x,z)>=120&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z);
    }
    if(good)S={x:px,z:pz,R,ph};
  }
  drkCache.set(key,S);return S;
}
function drkNear(x,z){                                             // 地面の色用: 黒くなる範囲(R*1.25)の中なら、その汚染
  const S=drkSite(Math.floor(x/DRK_C),Math.floor(z/DRK_C));
  return S&&drkD(S,x,z)<S.R*1.25?S:null;
}
function drkClear(x,z){const S=drkSite(Math.floor(x/DRK_C),Math.floor(z/DRK_C));return !!S&&drkD(S,x,z)<S.R*1.05}   // 家などは黒い範囲(R*1.05)の中に置かない
function drkEnv(x,z){                                              // 空・霧・光用: その場所の闇の濃さ(0〜1)。地面より広く(R*1.7まで)、なめらかに濃くなる
  const ix=Math.floor(x/DRK_C),iz=Math.floor(z/DRK_C);let m=0;
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const S=drkSite(ix+a,iz+b);if(!S)continue;m=Math.max(m,1-sm01(S.R*.5,S.R*1.7,drkD(S,x,z)))}
  return m;
}
function drkTint(c,f,x,z){
  const d=drkD(f,x,z),R=f.R,t=1-sm01(R*.4,R*1.25,d);if(t<=.01)return c;
  const n=.5+.5*Math.sin(x*.11+Math.sin(z*.08)*2.4)*Math.sin(z*.13+Math.sin(x*.09)*2.0),q=sm01(R*.1,R*.9,d);
  let r=.012+.1*q,g=.012+.1*q,b=.02+.13*q;                          // 中心ほど真っ黒、外へ向かって暗い青灰
  if(n>.75)b+=.05*(n-.75)*4*(1-q);                                   // ところどころ、ほんのり紫がかった黒
  return[c[0]+(r-c[0])*t,c[1]+(g-c[1])*t,c[2]+(b-c[2])*t];
}
const drkGroups=new Map();
let DRK_TEX=null;
function drkMake(S){
  if(!DRK_TEX){
    const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
    const rg=g.createRadialGradient(32,32,0,32,32,32);rg.addColorStop(0,'rgba(0,0,0,.9)');rg.addColorStop(.5,'rgba(0,0,0,.45)');rg.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=rg;g.fillRect(0,0,64,64);
    DRK_TEX=new THREE.CanvasTexture(c);
  }
  const rng=mulberry(hash(Math.round(S.x),Math.round(S.z),SEED+7776)*1e9|0),g=new THREE.Group(),N=200,pos=new Float32Array(N*3),vel=new Float32Array(N*3);
  const mist=(i,init)=>{const a=rng()*6.283,d=S.R*DRK_CORE*Math.sqrt(rng());pos[i*3]=S.x+Math.cos(a)*d;pos[i*3+2]=S.z+Math.sin(a)*d;pos[i*3+1]=heightAt(pos[i*3],pos[i*3+2])+(init?rng()*16:.5);vel[i*3]=(rng()-.5)*.8;vel[i*3+1]=.5+1.1*rng();vel[i*3+2]=(rng()-.5)*.8};
  for(let i=0;i<N;i++)mist(i,true);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({map:DRK_TEX,size:12,sizeAttenuation:true,transparent:true,opacity:.7,depthWrite:false,color:0x000000}));   // 黒いもや（通常のブレンドで黒く重ねる）
  pts.frustumCulled=false;g.add(pts);
  g.userData={pos,vel,geo,mist};
  return g;
}
function updateDrks(){                                             // プレイヤーが中央(650m以内)に来た汚染だけ、もやを出す（黒い地面は範囲全体に常にある）
  const ix=Math.floor(player.x/DRK_C),iz=Math.floor(player.z/DRK_C),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const S=drkSite(ix+a,iz+b);if(!S)continue;
    const d=Math.hypot(S.x-player.x,S.z-player.z),key=(ix+a)+','+(iz+b);
    if(d<650||(d<750&&drkGroups.has(key))){keep.add(key);if(!drkGroups.has(key)){const g=drkMake(S);scene.add(g);drkGroups.set(key,g)}}
  }
  for(const[k,g] of drkGroups)if(!keep.has(k)){scene.remove(g);g.userData.geo.dispose();drkGroups.delete(k)}
}
function clearDrks(){for(const g of drkGroups.values()){scene.remove(g);g.userData.geo.dispose()}drkGroups.clear()}
function drkAnimate(t,dt){
  for(const g of drkGroups.values()){
    const {pos,vel,geo,mist}=g.userData,n=pos.length/3;
    for(let i=0;i<n;i++){pos[i*3]+=vel[i*3]*dt+Math.sin(t*.5+i)*.3*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;if(pos[i*3+1]-heightAt(pos[i*3],pos[i*3+2])>18)mist(i,false)}
    geo.attributes.position.needsUpdate=true;
  }
}
function pollTint(c,x,z,rock){                                     // 汚染の中・まわりの木と岩の色（地面と同じ範囲R*1.25。中心ほど強く変わる）。汚染が重なる所は順に重ねる。c=THREE.Color（木は頂点色にかかる倍率なので、氷は青に大きく振る）
  const ap=(S,k,tr,tg,tb,dd)=>{const t=k*(1-sm01(S.R*.4,S.R*1.25,dd===undefined?Math.hypot(x-S.x,z-S.z):dd));if(t>.01){c.r+=(tr-c.r)*t;c.g+=(tg-c.g)*t;c.b+=(tb-c.b)*t}};
  let S=fireNear(x,z);
  if(S){const d=fireD(S,x,z),q=sm01(S.R*.1,S.R*.9,d),k=rock?1.3:1;ap(S,.92,(.2+.5*q)*k,(.1+.06*q)*k,.07*k,d)}   // 火: 中心ほど黒く焦げ、外へ向かって赤茶
  if(S=iceNear(x,z)){const d=iceD(S,x,z);if(rock)ap(S,.9,.62,.86,1.2,d);else ap(S,.9,1.1,1.6,3.4,d)}   // 氷: 青白く凍る
  if(S=thuNear(x,z)){if(rock)ap(S,.9,.3,.28,.36);else ap(S,.9,.34,.31,.42)}   // 雷: 黒ずんだ灰紫
  if(S=drkNear(x,z))ap(S,.95,.03,.03,.04,drkD(S,x,z));   // 闇: 真っ黒
}
function makeChunk(cx,cz){
  const g=new THREE.Group();
  let geo=new THREE.PlaneGeometry(CHUNK,CHUNK,SEG,SEG);geo.rotateX(-Math.PI/2);
  const p=geo.attributes.position,cols=[];
  for(let i=0;i<p.count;i++){
    const wx=p.getX(i)+cx*CHUNK+CHUNK/2,wz=p.getZ(i)+cz*CHUNK+CHUNK/2;
    const h=heightAt(wx,wz);p.setY(i,h);
    const slope=Math.abs(heightAt(wx+1,wz)-h)+Math.abs(heightAt(wx,wz+1)-h);
    cols.push(...colorFor(h,slope,wx,wz));
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
  geo=lowPoly(geo);
  const terrain=new THREE.Mesh(geo,triplanar(new THREE.MeshLambertMaterial({vertexColors:true,map:sandTex}),8,.35,0));terrain.receiveShadow=true;
  terrain.position.set(cx*CHUNK+CHUNK/2,0,cz*CHUNK+CHUNK/2);
  g.add(terrain);
  // 旧市街: 区画ごとにレンガ壁の建物（lotAtと共通）。張り出す柱/縁/アーチ枠・ドーム・ミナレット
  const arches=[],det=[],geos=[],circ=[],trees=[],rocks=[],pillars=[],fz=[],lat=[];   // trees=斧で殴れる木 / rocks=ツルハシで掘れる岩
  const pushArch=(x,y,z,ry,sw,sh,col)=>arches.push([x,y,z,ry,sw,sh,col]);
  const addBuilding=B=>{
    const bx=B.x,bz=B.z,w=B.w,d=B.d,ht=B.ht,grand=B.grand,mat=BUILD_MATS[B.mi];
    const bg=new THREE.BoxGeometry(w,ht,d),uv=bg.attributes.uv;
    const dims=[[d,ht],[d,ht],[w,d],[w,d],[w,ht],[w,ht]];
    for(let i=0;i<uv.count;i++){const f=Math.floor(i/4);uv.setXY(i,uv.getX(i)*dims[f][0]/2+B.uo,uv.getY(i)*dims[f][1]/2+B.vo)}
    geos.push(bg);
    const b=new THREE.Mesh(bg,mat);b.position.set(bx,TOWN_H+ht/2,bz);b.castShadow=b.receiveShadow=true;g.add(b);
    const dc=mat.color.clone().multiplyScalar(1.05),fc=mat.color.clone().multiplyScalar(1.14),kc=mat.color.clone().multiplyScalar(.2);
    det.push([bx,TOWN_H+ht+.05,bz,w+.5,.1,d+.5,dc]);
    if(B.roofedMarket){const roof=new THREE.Color(0x765033);det.push([bx,TOWN_H+ht+1.15,bz,w+3,0.7,d+3,roof]);det.push([bx,TOWN_H+ht+.72,bz,w+3,.16,d+3,fc]);}
    det.push([bx,TOWN_H+.45,bz,w+.5,.9,d+.5,fc]);                                  // 土台
    for(const sz of[-1,1]){det.push([bx,TOWN_H+ht+.55,bz+sz*d/2,w+.5,.9,.35,fc]);det.push([bx+sz*w/2,TOWN_H+ht+.55,bz,.35,.9,d+.5,fc])}   // 屋上の低い縁（パラペット）
    for(const sx of[-1,1])for(const sz of[-1,1])det.push([bx+sx*w/2,TOWN_H+ht/2,bz+sz*d/2,.9,ht,.9,dc]);
    if(ht>=6.5){                                                                // 2階建て以上: 軒下の雷文の帯と、角ぎわの縦の雷文帯
      const yb=TOWN_H+ht-.75,hh=ht-1.6;
      for(const sz of[-1,1]){fz.push([bx,yb,bz+sz*(d/2+.06),w-1.8,1,.12,FZ_C]);fz.push([bx+sz*(w/2+.06),yb,bz,.12,1,d-1.8,FZ_C])}
      for(const sx of[-1,1])for(const sz of[-1,1]){fz.push([bx+sx*(w/2-1.35),TOWN_H+hh/2+.9,bz+sz*(d/2+.06),1,hh,.12,FZ_C]);fz.push([bx+sx*(w/2+.06),TOWN_H+hh/2+.9,bz+sz*(d/2-1.35),.12,hh,1,FZ_C])}
    }
    const nf=Math.max(1,Math.round(ht/3.3)),oc=dc.clone().multiplyScalar(.9);
    for(let f=1;f<nf;f++)det.push([bx,TOWN_H+3.3*f-.15,bz,w+.3,.3,d+.3,dc]);   // 階の境目の帯
    if(B.dome){
      const R=Math.min(w,d)*(grand?.3:.28);
      const dm=new THREE.Mesh(domeG,DOME_M);dm.position.set(bx,TOWN_H+ht+.6,bz);dm.scale.set(R,R*1.1,R);g.add(dm);
    }
    if(B.min){
      const corners=grand||B.kind==='mosque'?[[1,1],[-1,1]]:[[1,1]];
      for(const[sx,sz] of corners){
        const mh=ht+(grand||B.kind==='mosque'?12:8),mx=bx+sx*(w/2-1.2),mz=bz+sz*(d/2-1.2);
        const m=new THREE.Mesh(minG,MIN_M);m.position.set(mx,TOWN_H+mh/2,mz);m.scale.set(1,mh,1);m.castShadow=true;g.add(m);
        const rg=new THREE.Mesh(ringG,MIN_M);rg.position.set(mx,TOWN_H+mh*.8,mz);g.add(rg);
        const c=new THREE.Mesh(capG,CAP_M);c.position.set(mx,TOWN_H+mh+1.2,mz);g.add(c);
      }
    }
    const rs=mulberry((Math.floor(B.uo*4294967295)^Math.floor(B.vo*4294967295)^Math.floor(bx*131+bz*71))>>>0),acc=ACC[Math.floor(rs()*ACC.length)],styled=!grand&&!B.shop&&(!!B.kind&&B.kind!=='tower'||rs()<.45);
    if(styled)det.push([bx,TOWN_H+ht-.35,bz,w+.62,.7,d+.62,acc]);                  // 差し色の軒帯（タイル帯）
    if(ht>=7&&!grand&&!B.dome&&!B.min&&!B.roofedMarket&&!B.kind){                              // 屋上の変化（歩いて上がれる低い建物には付けない）: 小部屋＋ドーム / 風採り塔 / 日よけ布 / 段になった上階 / 小さな東屋
      const rt=Math.floor(rs()*7),y0=TOWN_H+ht,sx=rs()<.5?-1:1,sz=rs()<.5?-1:1,smallDome=(x,y,z,R,mt)=>{const m=new THREE.Mesh(domeG,mt);m.position.set(x,y,z);m.scale.set(R,R*1.1,R);g.add(m)};
      if(rt<=1){const rw=Math.min(4.6,w*.45),rd=Math.min(4.6,d*.45),cx=bx+sx*(w/2-rw/2-1),cz=bz+sz*(d/2-rd/2-1);
        det.push([cx,y0+1.4,cz,rw,2.8,rd,dc]);det.push([cx,y0+2.9,cz,rw+.4,.2,rd+.4,fc]);
        det.push([cx,y0+1.05,cz+rd/2+.04,1.1,2.1,.1,kc]);det.push([cx+rw/2+.04,y0+1.7,cz,.1,.9,.9,kc]);det.push([cx,y0+2.4,cz+rd/2+.05,rw,.3,.1,acc]);
        if(rt===1)smallDome(cx,y0+3,cz,Math.min(rw,rd)*.32,CAP_M)}
      else if(rt===2){const tx=bx+sx*(w/2-1.5),tz=bz+sz*(d/2-1.5);                       // 風採り塔（四面に開口）
        det.push([tx,y0+1.9,tz,1.8,3.8,1.8,fc]);det.push([tx,y0+3.9,tz,2.2,.2,2.2,dc]);
        for(const[fx,fz] of[[1,0],[-1,0],[0,1],[0,-1]])det.push([tx+fx*.93,y0+2.9,tz+fz*.93,fx?.1:1,1.5,fx?1:.1,kc])}
      else if(rt===3){const cx=bx+sx*(w/2-2.6),cz=bz+sz*(d/2-2.2),cl=SHOP_C[Math.floor(rs()*6)];     // 日よけ布（4本の柱）
        for(const a of[-1,1])for(const b of[-1,1])det.push([cx+a*1.8,y0+1.2,cz+b*1.5,.14,2.4,.14,SHOP_WOOD]);
        det.push([cx,y0+2.45,cz,4.2,.12,3.6,cl])}
      else if(rt===4&&ht>=9.5){const uw=w*.62,ud=d*.62;                                  // 段になった上階
        det.push([bx,y0+1.65,bz,uw,3.3,ud,dc]);det.push([bx,y0+3.4,bz,uw+.5,.2,ud+.5,fc]);det.push([bx,y0+2.9,bz,uw+.6,.5,ud+.6,acc]);
        for(const f of[-1,1]){det.push([bx+f*uw*.22,y0+1.8,bz+ud/2+.04,.8,1.2,.1,kc]);det.push([bx+f*uw*.22,y0+1.8,bz-ud/2-.04,.8,1.2,.1,kc])}}
      else if(rt===5){for(const f of[-1,1]){const kx=bx+f*(w/2-1.8),kz=bz+sz*(d/2-1.8);       // 小さな東屋（青いドームを2つ）
        det.push([kx,y0+.9,kz,1.5,1.8,1.5,dc]);det.push([kx,y0+1.35,kz+.78,.7,.9,.08,kc]);smallDome(kx,y0+1.8,kz,.95,CAP_M)}}
    }
    if(B.kind){                                                                       // 公共の建物: モスク / 公衆浴場 / 時計塔 / 天文台 / 隊商宿 / 屋上茶屋
      const K=B.kind,y0=TOWN_H+ht,tt=B.town,fdx=tt?tt.x-bx:0,fdz=tt?tt.z-bz:1,ux=Math.abs(fdx)>Math.abs(fdz)?Math.sign(fdx):0,uz=ux?0:(Math.sign(fdz)||1),tx=uz?1:0,tz=ux?1:0;   // (ux,uz)=街の中心へ向く面
      const kd=(x,y,z,R,mt,sy)=>{const m=new THREE.Mesh(domeG,mt);m.position.set(x,y,z);m.scale.set(R,R*(sy||1.1),R);m.castShadow=true;g.add(m)};
      const gold=(x,y,z,a,b,c2)=>det.push([x,y,z,a,b,c2,GOLD_C]);
      const portal=(pw,ph)=>{const X=bx+ux*(w/2+.3),Z=bz+uz*(d/2+.3);                 // 大きな入口の門枠（イーワーン）
        det.push([X,TOWN_H+ph/2,Z,ux?.6:pw,ph,ux?pw:.6,fc]);det.push([X+ux*.35,TOWN_H+ph*.4,Z+uz*.35,ux?.1:pw*.62,ph*.8,ux?pw*.62:.1,kc]);det.push([X+ux*.33,TOWN_H+ph+.15,Z+uz*.33,ux?.8:pw+.6,.3,ux?pw+.6:.8,acc])};
      if(K==='mosque'){
        const R=Math.min(w,d)*.27;
        det.push([bx,y0+1.1,bz,R*1.7,2.2,R*1.7,fc]);kd(bx,y0+2.2,bz,R,CAP_M,1.15);                      // 大ドーム（青）と金の尖り・三日月
        gold(bx,y0+2.2+R*1.15+.7,bz,.18,1.6,.18);gold(bx,y0+2.2+R*1.15+1.3,bz,.7,.14,.14);
        for(const a of[-1,1]){const cx=bx+a*(w/2-1.5),cz=bz-(d/2-1.5);det.push([cx,y0+.8,cz,1.7,1.6,1.7,dc]);kd(cx,y0+1.6,cz,.95,CAP_M,1.1);gold(cx,y0+1.6+1.05+.35,cz,.1,.7,.1)}   // 奥の角の小ドーム
        portal(5.6,9.6)}
      else if(K==='hammam'){
        const R=Math.min(w,d)*.17;
        for(const a of[-1,1])for(const b of[-1,1]){const x=bx+a*w*.24,z=bz+b*d*.24;kd(x,y0+.1,z,R,DOME_M,1);det.push([x,y0+.1+R*1.05,z,.45,.25,.45,kc])}   // 4つの小ドーム（頂に明かり取り）
        det.push([bx+(w/2-1.1),y0+2.2,bz-(d/2-1.1),1.1,4.4,1.1,fc]);det.push([bx+(w/2-1.1),y0+4.5,bz-(d/2-1.1),1.5,.25,1.5,dc])}   // 煙突の塔
      else if(K==='tower'){
        det.push([bx,TOWN_H+1.5,bz,w+1.2,3,d+1.2,fc]);det.push([bx,y0,bz,w+1.8,.35,d+1.8,dc]);                // 台座とバルコニー
        det.push([bx,y0+1.7,bz,w*.78,3.4,d*.78,dc]);
        for(const f of[-1,1]){det.push([bx+f*(w*.39+.05),y0+1.9,bz,.1,1.6,.9,kc]);det.push([bx,y0+1.9,bz+f*(d*.39+.05),.9,1.6,.1,kc])}
        {const m=new THREE.Mesh(capG,CAP_M);m.position.set(bx,y0+3.4+2.4,bz);m.scale.set(w*.42,2,d*.42);m.castShadow=true;g.add(m)}
        gold(bx,y0+3.4+4.8+.5,bz,.3,1.2,.3);
        for(const[nx,nz] of[[1,0],[-1,0],[0,1],[0,-1]]){const X=bx+nx*(w/2+.1),Z=bz+nz*(d/2+.1),y=TOWN_H+ht-4;   // 4面の時計
          det.push([X,y,Z,nx?.14:2.8,2.8,nz?.14:2.8,GOLD_C]);det.push([X+nx*.05,y,Z+nz*.05,nx?.14:2.3,2.3,nz?.14:2.3,new THREE.Color(0xf2ead0)]);
          det.push([X+nx*.1,y+.4,Z+nz*.1,nx?.2:.12,.9,nz?.2:.12,kc]);det.push([X+nx*.1,y,Z+nz*.1,nx?.2:.8,.12,nz?.2:.8,kc])}}
      else if(K==='obs'){
        const R=Math.min(w,d)*.3;
        det.push([bx,y0+1.1,bz,R*1.8,2.2,R*1.8,fc]);kd(bx,y0+2.2,bz,R,DOME_M,1);                         // 天文台のドームと真鍮の望遠鏡
        {const m=new THREE.Mesh(colG,GOLD_M);m.position.set(bx+R*.6,y0+2.2+R*.7,bz);m.scale.set(.35,3.4,.35);m.rotation.z=-.75;m.castShadow=true;g.add(m)}
        det.push([bx-w/2+1,y0+3,bz-d/2+1,.12,4,.12,SHOP_WOOD]);det.push([bx-w/2+1.6,y0+4.6,bz-d/2+1,1.2,.7,.06,acc])}   // 旗
      else if(K==='inn'){
        portal(5.6,ht+2.4);
        for(let i=0;i<Math.floor(w/1.8);i++){const x=bx-w/2+.9+i*1.8;for(const sz of[-1,1])det.push([x,y0+1.4,bz+sz*(d/2-.15),.9,.8,.6,dc])}   // 屋上の胸壁
        for(let i=0;i<Math.floor(d/1.8);i++){const z=bz-d/2+.9+i*1.8;for(const sx of[-1,1])det.push([bx+sx*(w/2-.15),y0+1.4,z,.6,.8,.9,dc])}
        const Cx=bx+ux*(w/2+1.4),Cz=bz+uz*(d/2+1.4),Tx=Cx+tx*3.6,Tz=Cz+tz*3.6,Kx=Cx-tx*3.2,Kz=Cz-tz*3.2;      // 水桶と荷箱
        det.push([Tx,TOWN_H+.35,Tz,tx?2.4:.7,.7,tz?2.4:.7,SHOP_WOOD]);det.push([Tx,TOWN_H+.72,Tz,tx?2.1:.5,.1,tz?2.1:.5,new THREE.Color(0x3a7ca5)]);circ.push([Tx,Tz,1.2]);
        det.push([Kx,TOWN_H+.45,Kz,1,.9,1,SHOP_C[1]]);det.push([Kx-tx*1.2,TOWN_H+.35,Kz-tz*1.2,.8,.7,.8,SHOP_C[4]]);circ.push([Kx-tx*.6,Kz-tz*.6,1.1])}
      else if(K==='tea'){
        for(const a of[-1,1])for(const b of[-1,1]){const x=bx+a*w*.22,z=bz+b*d*.22,cl=SHOP_C[Math.floor(rs()*6)];   // 屋上テラス: 日傘とテーブル
          det.push([x,y0+.4,z,1,.8,1,SHOP_WOOD]);det.push([x,y0+1.3,z,.1,2.6,.1,SHOP_WOOD]);det.push([x,y0+2.65,z,2.4,.1,2.4,cl]);
          det.push([x+.95,y0+.25,z,.5,.5,.5,SHOP_WOOD]);det.push([x-.95,y0+.25,z,.5,.5,.5,SHOP_WOOD])}}
    }
    const doorW=grand?4.5:2.2,doorH=grand?9:3.4;
    const faces=[[0,1,w],[Math.PI,-1,w],[Math.PI/2,1,d],[-Math.PI/2,-1,d]];
    let dtl=null;
    for(let fi=0;fi<4;fi++){const[ry,sgn,span]=faces[fi];
      const alongX=(ry===0||ry===Math.PI);
      const px=(o,n)=>alongX?bx+o:bx+sgn*(w/2+n), pz=(o,n)=>alongX?bz+sgn*(d/2+n):bz+o;
      dtl=(o,y,ww,hh,dep,off,col)=>det.push([px(o,off),y,pz(o,off),alongX?ww:dep,hh,alongX?dep:ww,col]);
      dtl(0,TOWN_H+(doorH+.5)/2,doorW+.9,doorH+.5,.22,.11,styled?acc:fc);pushArch(px(0,.24),TOWN_H,pz(0,.24),ry,doorW,doorH,dc);   // 入口（縁取り付き。差し色の建物は縁が差し色）
      if(styled)dtl(0,TOWN_H+doorH+.15,doorW+1.5,.14,1.5,.75,acc);                   // 戸口の日よけ
      if(span>=6)for(const sx of[-1,1]){const o=sx*(doorW/2+1.6);if(Math.abs(o)<span/2-.8){dtl(o,TOWN_H+1.9,.8,1.1,.16,.08,kc);dtl(o,TOWN_H+1.25,1.2,.18,.3,.15,fc)}}   // 入口の脇の小窓
      const nw=Math.max(1,Math.floor(span/3.4));
      for(let f=1;f<nf;f++)for(let i=0;i<nw;i++){            // 各階の尖頭アーチ窓
        const o=(i-(nw-1)/2)*span/nw;
        if(grand&&f<=2&&Math.abs(o)<3.6)continue;
        dtl(o,TOWN_H+3.3*f+1.7,1.5,2.3,.22,.11,fc);pushArch(px(o,.24),TOWN_H+3.3*f+.8,pz(o,.24),ry,1,1.8,dc);   // 縁取り付きの窓
      }
      for(let f=1;f<nf;f++){                                 // 小窓（アーチ窓のあいだ・脇）と窓台
        const os=nw>1?Array.from({length:nw-1},(_,i)=>(i-(nw-2)/2)*span/nw):(span>=5?[-span*.32,span*.32]:[]);
        for(const o of os){dtl(o,TOWN_H+3.3*f+1.3,.7,.95,.16,.08,kc);dtl(o,TOWN_H+3.3*f+.75,1.1,.16,.3,.15,fc)}
      }
      for(let f=2;f<nf;f++)if((Math.floor(B.uo*997)+f*5+fi*3)%3===0){   // 張り出し窓（出窓）
        const o2=((fi+f)%3-1)*span*.22;
        lat.push([px(o2,.45),TOWN_H+3.3*f+1.3,pz(o2,.45),alongX?2.6:.9,2.2,alongX?.9:2.6,FZ_C]);
      }
    }
    if(B.shop){                                                                  // 商店の店先: 間口を4つに割り、日よけ・入口・カウンター・商品の箱
      const sh=B.shop,ax=sh.ax==='x',fx=ax?0:sh.face,fz=ax?sh.face:0,nb=4,bw=(ax?w:d)/nb;
      for(let i=0;i<nb;i++){
        const o=(i-(nb-1)/2)*bw,put=(a,off,y,wid,hh,dep,col)=>det.push([ax?bx+o+a:bx+fx*(w/2+off),TOWN_H+y,ax?bz+fz*(d/2+off):bz+o+a,ax?wid:dep,hh,ax?dep:wid,col]);
        put(0,.9,3.1,bw*.9,.14,1.8,SHOP_C[(i+Math.floor(B.uo*5))%6]);           // 日よけ
        put(0,.07,1.15,2.2,2.3,.14,kc);put(0,.4,.5,2.4,1,.6,SHOP_WOOD);          // 入口（暗い開口）とカウンター
        put(-.8,1.3,.3,.6,.6,.6,SHOP_C[(i+3)%6]);put(.8,1.3,.28,.55,.55,.55,SHOP_C[(i+1)%6]);   // 店先の商品
      }
    }
    if(B.arcade){                                      // 正面の回廊（柱＋屋根）
      for(const q of B.cols)pillars.push([q[0],q[1],.35,4]);
      det.push([bx,TOWN_H+4.25,bz+d/2+1.6,w,.5,3.2,dc]);
    }
    if(B.stair)for(const t of B.stair.treads)det.push([t.x,(TOWN_H+t.top)/2,t.z,t.w,t.top-TOWN_H,t.d,dc]);   // 外階段
    for(const br of B.bridges)det.push([br.x,br.top-.75,br.z,br.w,1.5,br.d,dc]);                            // サバート
  };
  const addOpenLot=o=>{                                                              // 小広場: 0=噴水とヤシ 1=露店市場 2=ヤシの木陰とベンチ 3=水槽（細長い池）
    const x0=o.x0,z0=o.z0,Y=TOWN_H,rs=mulberry((Math.floor(x0*7)*73856093^Math.floor(z0*7)*19349663)>>>0),sd=BUILD_MATS[0].color.clone().multiplyScalar(1.08),WC=new THREE.Color(0x3a7ca5);
    if(o.variant===0){
      const f=new THREE.Mesh(fountainG,fountainM);f.position.set(x0,Y+.25,z0);f.scale.set(1.5,1,1.5);g.add(f);
      const w2=new THREE.Mesh(waterG,waterM);w2.position.set(x0,Y+.52,z0);w2.scale.setScalar(1.5);g.add(w2);
      det.push([x0,Y+1.5,z0,.5,2.2,.5,sd]);det.push([x0,Y+2.7,z0,.9,.25,.9,ACC[Math.floor(rs()*5)]]);circ.push([x0,z0,1.9]);
      for(const[a,b] of[[-1,-1],[1,-1],[1,1],[-1,1]])if(rs()<.7){const px=x0+a*4.6,pz=z0+b*4.6;addPalm(g,px,Y,pz,.9+rs()*.4);circ.push([px,pz,.45])}
    }else if(o.variant===1){
      for(const a of[-1,1])for(const b of[-1,1]){const sx=x0+a*3.3,sz=z0+b*3.1,cl=SHOP_C[Math.floor(rs()*6)];
        for(const i of[-1,1])for(const j of[-1,1])det.push([sx+i*1.3,Y+1.2,sz+j*1,.14,2.4,.14,SHOP_WOOD]);
        det.push([sx,Y+2.45,sz,3,.12,2.4,cl]);det.push([sx,Y+.45,sz,2.2,.9,.8,SHOP_WOOD]);
        det.push([sx-.5,Y+1.1,sz,.6,.4,.5,SHOP_C[Math.floor(rs()*6)]]);det.push([sx+.5,Y+1.08,sz,.5,.36,.5,SHOP_C[Math.floor(rs()*6)]]);circ.push([sx,sz,1.2])}
    }else if(o.variant===2){
      for(let i=0;i<5;i++){const px=x0+(rs()*2-1)*5,pz=z0+(rs()*2-1)*5;if(Math.hypot(px-x0,pz-z0)<1.6)continue;addPalm(g,px,Y,pz,.9+rs()*.5);circ.push([px,pz,.45])}
      for(const a of[-1,1]){det.push([x0+a*2.2,Y+.3,z0,.9,.6,3,sd]);det.push([x0+a*2.2,Y+.62,z0,1.1,.12,3.2,SHOP_WOOD])}
    }else{
      det.push([x0,Y+.4,z0,7.4,.8,5.4,sd]);det.push([x0,Y+.84,z0,6.2,.12,4.2,WC]);
      for(const u of[-2.2,0,2.2])circ.push([x0+u,z0,2.8]);
      for(const a of[-1,1]){const px=x0+a*4.9,pz=z0+(rs()*2-1)*2;addPalm(g,px,Y,pz,.9+rs()*.4);circ.push([px,pz,.45])}
    }
  };
  const addCourt=o=>{                                  // 回廊つきの中庭
    for(const[x,z] of o.cols)pillars.push([x,z,.3,3.6]);
    const dc=BUILD_MATS[0].color.clone().multiplyScalar(1.05);
    for(const sg of[-1,1]){
      det.push([o.x0,TOWN_H+3.85,o.z0+sg*3.9,10.4,.5,2.6,dc]);
      det.push([o.x0+sg*3.9,TOWN_H+3.85,o.z0,2.6,.5,5.2,dc]);
    }
    const f=new THREE.Mesh(fountainG,fountainM);f.position.set(o.x0,TOWN_H+.25,o.z0);g.add(f);
    const w=new THREE.Mesh(waterG,waterM);w.position.set(o.x0,TOWN_H+.52,o.z0);g.add(w);
  };
  for(let lx=Math.floor(cx*CHUNK/L)-1;lx<=Math.ceil((cx+1)*CHUNK/L)+1;lx++)
  for(let lz=Math.floor(cz*CHUNK/L)-1;lz<=Math.ceil((cz+1)*CHUNK/L)+1;lz++){
    const x0=(lx+.5)*L,z0=(lz+.5)*L;
    if(Math.floor(x0/CHUNK)!==cx||Math.floor(z0/CHUNK)!==cz)continue;
    const o=lotAt(lx,lz);if(!o)continue;
    if(o.type==='b')addBuilding(o);
    else if(o.type==='court')addCourt(o);
    else if(o.type==='openlot')addOpenLot(o);
    else if(o.palms)for(const[px,pz,ps] of o.palms)addPalm(g,px,TOWN_H,pz,ps);   // 小広場(openlot)にはヤシが無いので何も置かない
  }
  for(const t of nearTowns(cx*CHUNK,cz*CHUNK))for(const m of t.landmarks)if(Math.floor(m.x/CHUNK)===cx&&Math.floor(m.z/CHUNK)===cz)addBuilding(m);
  const wd=new THREE.Object3D();
  for(const t of nearTowns(cx*CHUNK,cz*CHUNK)){                                  // 壁（外壁・内壁・宮殿の城壁）・ミナレット・主要な道のヤシ並木
    const bk=t.wallB.get(cx+','+cz);
    if(bk){
      if(bk.w.length){
        const wm=new THREE.InstancedMesh(boxG,WALL_M,bk.w.length*5);let wn=0;
        bk.w.forEach((a,i)=>{
          const jj=a[7]||0,hh=a[4]+jj*.07,tt=a[3]+jj*.05;wd.position.set(a[0],TOWN_H+hh/2,a[1]);wd.rotation.set(0,a[5],0);wd.scale.set(a[2],hh,tt);wd.updateMatrix();wm.setMatrixAt(wn++,wd.matrix);
          if(!a[6])for(const sx of[-1.6,1.6])for(const sz of[-1,1]){                    // 胸壁（凸凹）: 壁の上の両縁に歯形のブロック
            const lz=sz*(a[3]/2-.45),c=Math.cos(a[5]),sn=Math.sin(a[5]);
            wd.position.set(a[0]+c*sx+sn*lz,TOWN_H+a[4]+.65,a[1]-sn*sx+c*lz);wd.rotation.set(0,a[5],0);wd.scale.set(1.7,1.3,.9);wd.updateMatrix();wm.setMatrixAt(wn++,wd.matrix);
          }
          {const th=a[3]>6&&a[3]<9||a[3]>9;for(const j of th?[-2,0,2]:[-2.4,0,2.4])for(const k of th?[-a[3]/2+1.9,0,a[3]/2-1.9]:[0])circ.push([a[0]+Math.cos(a[5])*j+Math.sin(a[5])*k,a[1]-Math.sin(a[5])*j+Math.cos(a[5])*k,th?1.9:a[3]>4?a[3]*.55:1.8,TOWN_H+a[4]])}   // 壁の当たり判定（円を並べる）
        });
        wm.count=wn;wm.frustumCulled=false;wm.castShadow=wm.receiveShadow=true;g.add(wm);
      }
      if(bk.t.length){                                                          // 半円塔（円柱＋上縁の胸壁）
        const tm=new THREE.InstancedMesh(towG,WALL_M,bk.t.length),mm=new THREE.InstancedMesh(boxG,WALL_M,bk.t.length*10);let mn=0;
        bk.t.forEach((a,i)=>{
          wd.position.set(a[0],TOWN_H+a[3]/2,a[1]);wd.rotation.set(0,0,0);wd.scale.set(a[2],a[3],a[2]);wd.updateMatrix();tm.setMatrixAt(i,wd.matrix);
          for(let k=0;k<10;k++){const an=k/10*Math.PI*2;wd.position.set(a[0]+Math.cos(an)*(a[2]-.45),TOWN_H+a[3]+.65,a[1]+Math.sin(an)*(a[2]-.45));wd.rotation.set(0,-(an+Math.PI/2),0);wd.scale.set(1.7,1.3,.9);wd.updateMatrix();mm.setMatrixAt(mn++,wd.matrix)}
          circ.push([a[0],a[1],a[2]]);
        });
        for(const m of[tm,mm]){m.frustumCulled=false;m.castShadow=m.receiveShadow=true;g.add(m)}
      }
      for(const[mx,mz,mh] of bk.m){                                              // ミナレット（塔身・輪・尖り屋根）
        const sh=new THREE.Mesh(minG,MIN_M);sh.position.set(mx,TOWN_H+mh/2,mz);sh.scale.set(2.3,mh,2.3);sh.castShadow=true;g.add(sh);
        const rg=new THREE.Mesh(ringG,MIN_M);rg.position.set(mx,TOWN_H+mh*.8,mz);rg.scale.set(1.9,1.2,1.9);g.add(rg);
        const cp=new THREE.Mesh(capG,CAP_M);cp.position.set(mx,TOWN_H+mh+2.4,mz);cp.scale.set(2,2,2);g.add(cp);
        circ.push([mx,mz,2.8]);
      }
    }
    const mq=t.moatB.get(cx+','+cz);                                             // 水路の水面
    if(mq){const v=[],Y=TOWN_H-1.4;for(const q of mq)v.push(q[0],Y,q[1],q[2],Y,q[3],q[4],Y,q[5],q[0],Y,q[1],q[4],Y,q[5],q[6],Y,q[7]);
      const mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.Float32BufferAttribute(v,3));mg.computeVertexNormals();geos.push(mg);g.add(new THREE.Mesh(mg,MOAT_M))}
    const dk=t.deckB.get(cx+','+cz);                                             // 橋（傾斜路・橋桁・欄干・橋脚）
    if(dk){
      if(dk.box.length){const dmk=new THREE.InstancedMesh(boxG,DECK_M,dk.box.length);dk.box.forEach((a,i)=>{wd.position.set(a[0],a[1],a[2]);wd.rotation.set(0,0,0);wd.scale.set(a[3],a[4],a[5]);wd.updateMatrix();dmk.setMatrixAt(i,wd.matrix)});dmk.frustumCulled=false;dmk.castShadow=dmk.receiveShadow=true;g.add(dmk)}
      if(dk.fz.length){const fmz=new THREE.InstancedMesh(boxG,FRIEZE_M,dk.fz.length);dk.fz.forEach((a,i)=>{wd.position.set(a[0],a[1],a[2]);wd.rotation.set(0,0,0);wd.scale.set(a[3],a[4],a[5]);wd.updateMatrix();fmz.setMatrixAt(i,wd.matrix);fmz.setColorAt(i,a[6])});fmz.frustumCulled=false;fmz.castShadow=fmz.receiveShadow=true;g.add(fmz)}
      for(const a of dk.pr){const pg=prismGeo(a);geos.push(pg);const m=new THREE.Mesh(pg,DECK_M);m.castShadow=m.receiveShadow=true;g.add(m)}
      for(const c of dk.pc)circ.push(c);
      for(const a of dk.gh)addGate(g,geos,a[0],a[1],a[2],a[3]);
    }
  }
  const dummy=new THREE.Object3D();
  if(arches.length){
    const fm=new THREE.InstancedMesh(frameG,frameM,arches.length),isW=a=>a[4]===1&&a[5]===1.8,mk=(list,mat,tint)=>{
      if(!list.length)return;const im=new THREE.InstancedMesh(archG,mat,list.length);
      list.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,a[3],0);dummy.scale.set(a[4],a[5],1);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);if(tint)im.setColorAt(i,new THREE.Color().setScalar(.84+((Math.abs(a[0]*7+a[2]*13)%5)/5)*.26))});
      im.frustumCulled=false;g.add(im)};
    arches.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,a[3],0);dummy.scale.set(a[4],a[5],1);dummy.updateMatrix();fm.setMatrixAt(i,dummy.matrix);fm.setColorAt(i,a[6])});
    fm.frustumCulled=false;fm.receiveShadow=true;g.add(fm);
    mk(arches.filter(isW),archGlassM,true);mk(arches.filter(a=>!isW(a)),archM,false);
  }
  for(const[list,mat] of[[fz,FRIEZE_M],[lat,LATTICE_M]])if(list.length){                                   // 雷文の帯・木の格子の出窓
    const m=new THREE.InstancedMesh(boxG,mat,list.length);
    list.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,0,0);dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,a[6])});
    m.frustumCulled=false;m.castShadow=m.receiveShadow=true;g.add(m);
  }
  if(det.length){
    const dm2=new THREE.InstancedMesh(boxG,detailM,det.length);
    det.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,0,0);dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();dm2.setMatrixAt(i,dummy.matrix);dm2.setColorAt(i,a[6])});
    dm2.frustumCulled=false;dm2.castShadow=dm2.receiveShadow=true;g.add(dm2);
  }
  if(pillars.length){
    const cm=new THREE.InstancedMesh(colG,colM,pillars.length);
    pillars.forEach((a,i)=>{dummy.position.set(a[0],TOWN_H+a[3]/2,a[1]);dummy.rotation.set(0,0,0);dummy.scale.set(a[2],a[3],a[2]);dummy.updateMatrix();cm.setMatrixAt(i,dummy.matrix)});
    cm.frustumCulled=false;cm.castShadow=cm.receiveShadow=true;g.add(cm);
  }
  // 木・岩（チャンク座標から決定的に配置）: 気候帯・植生ごとに種類と密度が変わる
  //  砂漠=ほぼ何も無い(水辺にヤシ) / サバンナ=傘形の木がぽつぽつ / ステップ=ほぼ草だけ / 草原=広葉樹がまばら / 広葉樹林=広葉樹が密
  //  熱帯=ヤシとやや高い木、ジャングル=背の高い木が密集 / 冷帯=針葉樹林（雪をかぶる）、雪原は小さな針葉樹がまばら
  const r=mulberry(hash(cx,cz,SEED)*1e9|0);
  const hutB=[],hutC=[],hutR=[],empWalls=[];                 // 帝国の居住地と諸侯領の境界城壁
  {const E=empireXZ(cx*CHUNK,cz*CHUNK);if(E){empWalls.push(...empireBoundaryWalls(cx,cz,E));for(const a of empFortressRoofs(cx,cz,E))hutC.push(a);for(const a of empFortressDeco(cx,cz,E))hutB.push(a);const hr=mulberry(hash(cx,cz,SEED+9100)*1e9|0);
    // 帝国内の道（街道・小道）沿いに、その土地の気候・バイオームに合った家を建てる。
    empDistrict(E,cx*CHUNK+CHUNK/2,cz*CHUNK+CHUNK/2);
    const bq=[],bn=[],bcl=[],BC=new THREE.Color(),quad=(A,B,Cc,D,color,ref)=>pushQuad(bq,bn,bcl,BC,A,B,Cc,D,color,ref);
    for(const bd of(E.bch.get(cx+','+cz)||[])){                       // 道沿いの家: 公国・王都の城壁内と同じ家（石の1階＋木骨の上階・屋根窓・日よけなど）
      const[x,z,w,d,,ry]=bd;
      const h0=heightAt(x,z);
      if(h0<WATER+2||h0>16||mtBump(x,z)>0||empTownQ(x,z)<70||(caravanClear(x,z)||twClear(x,z))||nomadClear(x,z)||campClear(x,z)||tribeClear(x,z)||rgClear(x,z)||lmClear(x,z)||fireClear(x,z)||iceClear(x,z)||thuClear(x,z)||drkClear(x,z)||riverEff(x,z)<14||villageDist(x,z)<25||fieldAt(x,z,6))continue;
      const c0=Math.cos(ry),s0=Math.sin(ry);let lo=h0,hi=h0;for(const[a,b]of[[1,1],[1,-1],[-1,1],[-1,-1]]){const hv=heightAt(x+(a*w/2)*c0+(b*d/2)*s0,z-(a*w/2)*s0+(b*d/2)*c0);lo=Math.min(lo,hv);hi=Math.max(hi,hv)}
      if(hi-lo>1.4)continue;
      const rr=mulberry(hash(Math.round(x),Math.round(z),SEED+6161)*1e9|0),y0=hi+.25;
      drawTownHouse({x,z,ry,w,d,y0},quad,rr);
      if(hi-lo>.15){                                                  // 斜面: 低い側の隙間を石の基礎で埋める
        const T=(lx,ly,lz)=>[x+lx*c0+lz*s0,ly,z-lx*s0+lz*c0],fh=hi-lo+.5,R=T(0,lo,0),hw=w/2+.1,hd=d/2+.1,yb=lo-.3,yt=y0-.2;
        const V=(i,j,k)=>T((i-.5)*2*hw,j?yt:yb,(k-.5)*2*hd);
        quad(V(0,0,0),V(1,0,0),V(1,1,0),V(0,1,0),0x8d8a82,R);quad(V(0,0,1),V(1,0,1),V(1,1,1),V(0,1,1),0x8d8a82,R);
        quad(V(0,0,0),V(0,0,1),V(0,1,1),V(0,1,0),0x8d8a82,R);quad(V(1,0,0),V(1,0,1),V(1,1,1),V(1,1,0),0x8d8a82,R);
      }
      hutR.push([x,z,Math.max(w,d)/2+1.5]);
      for(const u of[-(w-d)/2,0,(w-d)/2])circ.push([x+u*c0,z-u*s0,Math.min(w,d)/2+.3]);
    }
    if(bq.length){
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(bq,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(bn,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(bcl,3));
      geo.computeBoundingSphere();
      if(!VMAT)VMAT=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
      const m=new THREE.Mesh(geo,VMAT);m.castShadow=m.receiveShadow=true;g.add(m);geos.push(geo);
    }
  }}
  const Lpine=[],LpineS=[],Ltree=[],Ljung=[],Lacac=[],Lpalm=[],Lrock=[],tcol=(v,w)=>new THREE.Color(v,v*(.94+.12*w),v);
  for(let i=0;i<96;i++){
    const x=cx*CHUNK+r()*CHUNK,z=cz*CHUNK+r()*CHUNK,q=r(),s0=r(),s1=r(),ry=r()*6.283,tn=r();   // 乱数は先に全部引く（分岐しても他の木の位置が変わらないように）
    const c=climateAt(x,z),de=c.de,sv=c.sv,st=c.st,gr=c.gr,bf=c.bf,tg=c.tg,tf=c.tf,jg=c.jg,cg=c.cg,ta=c.ta,tu=c.tu,sn=c.sn,ic=c.ic,sq=c.sq,cn=sm01(.35,.7,canopyRaw(x,z));   // すぐ読む
    let pPine=ta*(.24+.52*cn)+sq*.05+cg*(.02+.06*cn*cn)+Math.max(0,tu-ic)*.025,   // セコイアの森の林床には若い針葉樹・広葉樹・岩を少し

      pTree=bf*(.2+.4*cn)+sq*.03+gr*(.03+.1*cn*cn)+tg*(.015+.04*cn)+st*.002,
      pJung=jg*(.22+.45*cn)+tf*(.12+.28*cn),
      pAca=sv*(.012+.03*cn*cn),
      pPalmMax=de*.06+tg*.03+tf*.012+jg*.008,
      pRock=de*.01+sv*.02+st*.015+gr*.035+bf*.02+tg*.015+tf*.015+jg*.01+cg*.04+ta*.025+sq*.03+tu*.045;
    {const fb=empForestW(x,z);if(fb>0){pPine+=.7*fb;pTree*=1-fb;pJung*=1-fb}}
    {const al=sm01(30,110,mtBump(x,z));if(al>0){pPine+=(pTree+pJung)*al;pTree*=1-al;pJung*=1-al}}   // 山の中腹から上は針葉樹（広葉樹・ジャングルは針葉樹に置き換わる）
    if(q>=pPine+pTree+pJung+pAca+pPalmMax+pRock)continue;
    const h=heightAt(x,z);
    const mt=mtBump(x,z);if(h<WATER+1.5||h>Math.max(170,16+Math.min(mt,300))||(mt>0&&mt>mtTL(x,z)-8)||townW(x,z)>0||(caravanClear(x,z)||twClear(x,z))||nomadClear(x,z)||campClear(x,z)||tribeClear(x,z)||rgClear(x,z)||lmClear(x,z)||riverEff(x,z)<5||villageDist(x,z)<17||portNear(x,z,22)||churchTreeBlock(x,z)||fieldAt(x,z,4)||empRoadD(x,z)<5||empCapCut(x,z,s1)||hutR.some(q=>Math.hypot(x-q[0],z-q[1])<q[2]))continue;   // 森林限界より上・川の中や岸には生やさない
    const pPalm=de*(h<WATER+4?.06:.006)+tg*.03+tf*.012+jg*.008,
      c1=pPine,c2=c1+pTree,c3=c2+pJung,c4=c3+pAca,c5=c4+pPalm,c6=c5+pRock,
      kind=q<c1?0:q<c2?1:q<c3?2:q<c4?3:q<c5?4:q<c6?5:-1;
    if(kind<0)continue;
    if(kind<=4&&de>.2&&ry/6.2832<.9*de*(1-oasisW(x,z)))continue;   // 砂漠ではオアシスのまわり以外、木（ヤシ・アカシアなど）をほとんど置かない
    const slope=Math.abs(heightAt(x+1,z)-h)+Math.abs(heightAt(x,z+1)-h);
    if(slope>(kind===5||kind<=2?1:.5))continue;                   // 針葉樹・広葉樹・ジャングルの木は山の急斜面(1.0)まで生やす。ヤシ・サバンナの木は従来どおり(.5)
    if(kind<=2&&slope>.5&&ry/6.2832>1-.55*sm01(.5,1,slope))continue;   // 急な斜面ほど間引く（slope=1.0で約45%）
    const sk=kind<=3?Math.max(0,slope-.5)*.9:0;                      // 斜面では根元を少し埋めて、谷側のすき間を隠す
    if(kind===0){const s=(.85+.45*s0)*(1-.25*tu);(sn>.5?LpineS:Lpine).push([x,h-.2-sk,z,s,ry,s*(.95+.2*s1),tcol(.8+.3*tn,s1)]);circ.push([x,z,.55*s]);}
    else if(kind===1){const s=bf>gr?.95+.65*s0:.8+.5*s0;Ltree.push([x,h-.1-sk,z,s,ry,s,tcol(.82+.28*tn,s1)]);circ.push([x,z,.5*s]);}
    else if(kind===2){const s=.58+.4*s0+.5*jg/(jg+tf+1e-6);Ljung.push([x,h-.2-sk,z,s,ry,s*(.95+.15*s1),tcol(.8+.3*tn,s1)]);circ.push([x,z,.6*s]);}
    else if(kind===3){const s=.8+.5*s0;Lacac.push([x,h-.1-sk,z,s,ry,s,tcol(.85+.25*tn,s1)]);circ.push([x,z,.35*s]);}
    else if(kind===4){const s=.8+.9*s0;Lpalm.push([x,h,z,s,ry,s,tcol(.9+.15*tn,s1)]);circ.push([x,z,.45]);}
    else{
      const s=.7+s0*(.9+de*1.4),m=.85+.3*tn,wn=sv+st+gr,wf=bf+tg+tf,wc=cg+ta;      // 砂漠の岩は大きめの砂岩、草原は灰色、森は苔むした色、冷帯は青灰色、雪原は白っぽい
      Lrock.push([x,h+.3*s,z,s,ry,s*.7,new THREE.Color((.8*de+.65*wn+.5*wf+.38*jg+.6*wc+.72*tu)*m,(.68*de+.6*wn+.52*wf+.46*jg+.63*wc+.76*tu)*m,(.48*de+.5*wn+.45*wf+.36*jg+.68*wc+.82*tu)*m)]);circ.push(s<=1.5?[x,z,s*.9,h+s,h]:[x,z,s*.9]);   // 小さな岩(高さ1.5m以下)はジャンプで越えられる
    }
  }
  {const ra=mulberry(hash(cx,cz,SEED+9300)*1e9|0);                // 山頂まわり（森林限界より上）: 岩・岩の尖塔・這うように低い針葉樹。標高が高いほど雪をかぶる
    for(let i=0;i<48;i++){
      const x=cx*CHUNK+ra()*CHUNK,z=cz*CHUNK+ra()*CHUNK,u=ra(),v=ra(),w=ra(),ry=ra()*6.283,mt=mtBump(x,z);
      if(mt<=0)continue;
      const up=mt-(mtTL(x,z)-8);if(up<-4)continue;
      const h=heightAt(x,z);if(h<WATER+1.5||riverEff(x,z)<5||townW(x,z)>0)continue;
      const sn=sm01(185,250,mt)*.7,g=.5+.12*w,rc=(d)=>new THREE.Color(g+d+(1-g-d)*sn,g+d-.02+(1-g-d+.02)*sn,g+d+.04+(1-g-d-.04)*sn);
      if(up>0&&u<.08){const s=1.4+1.6*v,sy=s*(2.2+3*w);Lrock.push([x,h+sy*.5,z,s,ry,sy,rc(.04)]);circ.push([x,z,s*.95])}     // 岩の尖塔
      else if(up>0&&u<.5){const s=.8+2.4*v*v;Lrock.push([x,h+.3*s,z,s,ry,s*.7,rc(0)]);circ.push(s<=1.5?[x,z,s*.9,h+s,h]:[x,z,s*.9])}                 // 岩
      else if(up<50&&v<.6*(1-sm01(0,50,up))&&Math.abs(heightAt(x+1,z)-h)+Math.abs(heightAt(x,z+1)-h)<1.2){const s=.35+.3*u;Lpine.push([x,h-.1,z,s,ry,s*(.9+.2*w),tcol(.6+.25*w,v)])}   // 低木（森林限界ぎわほど多い）
    }}
  const Lfire=[];                                                  // 火の汚染の岩: 傾いた赤橙の岩の尖塔（群れで立つ）と、丸い大きな岩。汚染の中ほど多い。色は汚染の黒ずみで塗りつぶさず、中心ほど焦げて、外ほど赤橙になる
  {const FS=fireSite(Math.floor((cx*CHUNK+CHUNK/2)/FIRE_C),Math.floor((cz*CHUNK+CHUNK/2)/FIRE_C));
    if(FS){const rf=mulberry(hash(cx,cz,SEED+9411)*1e9|0),RC=FS.R*FIRE_CORE;
      for(let i=0;i<28;i++){
        const x=cx*CHUNK+rf()*CHUNK,z=cz*CHUNK+rf()*CHUNK,pk=rf(),u=rf(),v=rf(),w=rf(),ry=rf()*6.283,tx=(rf()-.5)*.55,tz=(rf()-.5)*.55;
        const d=fireD(FS,x,z),inn=1-sm01(FS.R*.3,FS.R*1.1,d);
        if(inn<.03||pk>.4*inn)continue;
        const h=heightAt(x,z),mt=mtBump(x,z);
        if(h<WATER+1.5||h>Math.max(170,16+Math.min(mt,300))||(mt>0&&mt>mtTL(x,z)-8)||townW(x,z)>0||(caravanClear(x,z)||twClear(x,z))||nomadClear(x,z)||campClear(x,z)||tribeClear(x,z)||rgClear(x,z)||lmClear(x,z)||riverEff(x,z)<5||villageDist(x,z)<17||portNear(x,z,22)||churchTreeBlock(x,z)||fieldAt(x,z,4)||empRoadD(x,z)<5||empCapCut(x,z,w)||hutR.some(q=>Math.hypot(x-q[0],z-q[1])<q[2]))continue;
        if(d<RC*1.15&&FS.V.some(q=>Math.hypot(x-FS.x-q.u,z-FS.z-q.v)<q.rad+6))continue;   // 炎の穴のそばには置かない
        if(Math.abs(heightAt(x+1,z)-h)+Math.abs(heightAt(x,z+1)-h)>1.4)continue;
        const sc=.55+.45*sm01(RC*.5,FS.R*.9,d),m=(.86+.28*w)*sc;                  // 中心ほど焦げて暗く、外ほど赤橙
        if(u<.24){                                                                   // 尖塔: 細長い岩が傾いて立つ。まわりに小さな尖塔が寄り添う
          const s=1.4+1.8*v,sy=s*(3+4*w),lean=Math.hypot(tx,tz),col=new THREE.Color((.95+.05*w)*m,(.5+.08*v)*m,(.36+.06*w)*m);
          Lfire.push([x,h+sy*.5*Math.cos(lean)-.9,z,s,ry,sy,col,tx,tz]);circ.push([x,z,s*.95]);
          const nc=1+Math.floor(2*rf());
          for(let k=0;k<nc;k++){const a=rf()*6.283,dd=s*(1.1+.8*rf()),cx2=x+Math.cos(a)*dd,cz2=z+Math.sin(a)*dd,s2=s*(.45+.35*rf()),sy2=sy*(.35+.4*rf()),l2=Math.hypot(tx*.8,tz*.8),h2=heightAt(cx2,cz2);
            if(h2<WATER+1.5||townW(cx2,cz2)>0||riverEff(cx2,cz2)<5||villageDist(cx2,cz2)<17||fieldAt(cx2,cz2,4))continue;
            Lfire.push([cx2,h2+sy2*.5*Math.cos(l2)-.7,cz2,s2,ry+(rf()-.5)*.8,sy2,new THREE.Color((.9+.08*rf())*m,(.46+.08*rf())*m,(.33+.06*rf())*m),tx*.8,tz*.8]);circ.push([cx2,cz2,s2*.95])}
        }else{                                                                       // 丸い大きな岩（ときどき暗い紫褐色）
          const s=1+2.6*v*v,dk=w>.82,col=dk?new THREE.Color(.42*sc,.26*sc,.28*sc):new THREE.Color((.82+.1*w)*m,(.42+.1*w)*m,(.3+.08*w)*m);
          Lfire.push([x,h+.3*s,z,s,ry,s*(.6+.2*u),col]);circ.push(s<=1.5?[x,z,s*.9,h+s,h]:[x,z,s*.9]);
        }
      }
    }}
  const Lcact=[];                                                  // 砂漠のサボテン: 砂漠ほど、岩の地域の平らな台地・渓谷の底にも点々と生える。砂丘の海では少なめ
  {const FSd=climateAt(cx*CHUNK+CHUNK/2,cz*CHUNK+CHUNK/2).de;
    if(FSd>.25){const rc=mulberry(hash(cx,cz,SEED+9633)*1e9|0);
      for(let i=0;i<10;i++){
        const x=cx*CHUNK+rc()*CHUNK,z=cz*CHUNK+rc()*CHUNK,pk=rc(),s0c=rc(),s1c=rc(),ryc=rc()*6.283,tnc=rc(),nc=1+Math.floor(2.5*rc()*rc()),oa=rc()*6.283;
        const dec=climateAt(x,z).de;if(dec<.3||pk>(.02+.12*oasisW(x,z))*dec*(1-.6*duneSeaW(x,z)))continue;
        for(let k=0;k<nc;k++){
          const cx2=x+(k?Math.cos(oa+k*2.1)*(2+3*s1c):0),cz2=z+(k?Math.sin(oa+k*2.1)*(2+3*s1c):0),h=heightAt(cx2,cz2),mt=mtBump(cx2,cz2);
          if(h<WATER+2.5||h>Math.max(170,16+Math.min(mt,300))||(mt>0&&mt>mtTL(cx2,cz2)-8)||townW(cx2,cz2)>0||(caravanClear(cx2,cz2)||twClear(cx2,cz2))||nomadClear(cx2,cz2)||campClear(cx2,cz2)||tribeClear(cx2,cz2)||rgClear(cx2,cz2)||lmClear(cx2,cz2)||riverEff(cx2,cz2)<5||villageDist(cx2,cz2)<17||portNear(cx2,cz2,22)||churchTreeBlock(cx2,cz2)||fieldAt(cx2,cz2,4)||empRoadD(cx2,cz2)<5||empCapCut(cx2,cz2,s1c)||hutR.some(q=>Math.hypot(cx2-q[0],cz2-q[1])<q[2]))continue;
          if(Math.abs(heightAt(cx2+1,cz2)-h)+Math.abs(heightAt(cx2,cz2+1)-h)>.5)continue;
          const sc=(.7+.7*s0c)*(k?.7:1);
          Lcact.push([cx2,h-.1,cz2,sc,ryc+k*1.7,sc*(.85+.3*s1c),tcol(.85+.25*tnc,s1c)]);circ.push([cx2,cz2,.45*sc]);
        }
      }}}
  {const OS=oasisOfCell(Math.floor((cx*CHUNK+CHUNK/2)/OAC),Math.floor((cz*CHUNK+CHUNK/2)/OAC));   // オアシスの茂み: 池のまわりにヤシ・広葉樹・アカシアが密に（池の中には生やさない）
    if(OS&&Math.hypot(cx*CHUNK+CHUNK/2-OS.x,cz*CHUNK+CHUNK/2-OS.z)<OS.Rg+24){const ro=mulberry(hash(cx,cz,SEED+9777)*1e9|0);
      for(let i=0;i<40;i++){
        const x=cx*CHUNK+ro()*CHUNK,z=cz*CHUNK+ro()*CHUNK,pk=ro(),ut=ro(),s0o=ro(),s1o=ro(),ryo=ro()*6.283,tno=ro();
        const d=Math.hypot(x-OS.x,z-OS.z);if(d<OS.Rp*1.3||d>OS.Rg)continue;
        const gw=1-sm01(OS.Rp*1.3,OS.Rg,d);if(pk>.5*gw+.04)continue;
        const h=heightAt(x,z);if(h<WATER+1.5||townW(x,z)>0||(caravanClear(x,z)||twClear(x,z))||nomadClear(x,z)||campClear(x,z)||tribeClear(x,z)||rgClear(x,z)||lmClear(x,z)||villageDist(x,z)<17||fieldAt(x,z,4)||empRoadD(x,z)<5||hutR.some(q=>Math.hypot(x-q[0],z-q[1])<q[2]))continue;
        if(Math.abs(heightAt(x+1,z)-h)+Math.abs(heightAt(x,z+1)-h)>.6)continue;
        if(ut<.6){const sp=.9+.8*s0o;Lpalm.push([x,h,z,sp,ryo,sp,tcol(.9+.15*tno,s1o)]);circ.push([x,z,.45])}
        else if(ut<.85){const st2=.9+.5*s0o;Ltree.push([x,h-.1,z,st2,ryo,st2,tcol(.82+.28*tno,s1o)]);circ.push([x,z,.5*st2])}
        else{const sa=.8+.5*s0o;Lacac.push([x,h-.1,z,sa,ryo,sa,tcol(.85+.25*tno,s1o)]);circ.push([x,z,.35*sa])}
      }}}
  const Lseq=[];                                                   // セコイア（高さ60〜100m・直径6〜10m）: 16m格子に最大1本ずつ、ゆらぎをつけて置く（幹どうしが重ならない）
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
    const gx=cx*2+i,gz=cz*2+j,rs=mulberry(hash(gx,gz,SEED+7771)*1e9|0),a=rs(),b=rs(),s0q=rs(),s1q=rs(),tnq=rs(),ryq=rs(),pq=rs();
    const x=(gx+.5)*16+(a-.5)*5,z=(gz+.5)*16+(b-.5)*5;
    if(pq>=climateAt(x,z).sq*.9)continue;                           // 森の中心ほど密（CVはすぐ読む）
    const h=heightAt(x,z),mt=mtBump(x,z);
    if(h<WATER+2||h>Math.max(170,16+Math.min(mt,300))||(mt>0&&mt>mtTL(x,z)-8)||townW(x,z)>0||(caravanClear(x,z)||twClear(x,z))||nomadClear(x,z)||campClear(x,z)||tribeClear(x,z)||rgClear(x,z)||lmClear(x,z)||riverEff(x,z)<10||villageDist(x,z)<30||portNear(x,z,30)||churchTreeBlock(x,z)||fieldAt(x,z,6)||empRoadD(x,z)<8||empCapCut(x,z,s1q)||hutR.some(q=>Math.hypot(x-q[0],z-q[1])<q[2]+4))continue;
    if(Math.abs(heightAt(x+1,z)-h)+Math.abs(heightAt(x,z+1)-h)>.8)continue;      // 急な斜面には立てない
    const sx=.75+.5*s0q,sy=.75+.5*(.65*s0q+.35*s1q);                 // 直径=8m×sx(6〜10m)・高さ=80m×sy(60〜100m)
    Lseq.push([x,h-.3,z,sx,ryq*6.283,sy,tcol(.85+.25*tnq,s1q)]);circ.push([x,z,4.3*sx]);
  }
  for(const L of[Lpine,LpineS,Ltree,Ljung,Lacac,Lpalm,Lcact,Lseq])for(const a of L)pollTint(a[6],a[0],a[2],false);   // 火・氷・雷の汚染の中の木と岩は、色を汚染に合わせる
  for(const a of Lrock)pollTint(a[6],a[0],a[2],true);
  for(const a of Lfire)Lrock.push(a);                              // 火の汚染の岩は色を塗りつぶさないよう、汚染の色付けの後に足す
  if(CUT.size){                                                    // 切った木は、再生成されたチャンクでも出さない（見た目も当たり判定も）
    for(const l of [Lpine,LpineS,Ltree,Ljung,Lacac,Lpalm,Lcact,Lrock])for(let i=l.length-1;i>=0;i--)if(CUT.has(ck(l[i][0],l[i][2])))l.splice(i,1);
    for(let i=circ.length-1;i>=0;i--)if(CUT.has(ck(circ[i][0],circ[i][1])))circ.splice(i,1);
  }
  const vctr=new THREE.Vector3(cx*CHUNK+CHUNK/2,5,cz*CHUNK+CHUNK/2);
  const mkInst=(geo,mat,list,shadow,tp,rk)=>{
    if(!list.length)return;
    const gg=geo.clone();gg.boundingSphere=new THREE.Sphere(vctr,64);geos.push(gg);          // チャンクの範囲を指定して、画面外のチャンクの木は描かない（背の高い木の分、大きめ）
    const m=new THREE.InstancedMesh(gg,mat,list.length);
    list.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(a[7]||0,a[4],a[8]||0);dummy.scale.set(a[3],a[5],a[3]);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,a[6])});
    if(tp)list.forEach((a,i)=>trees.push({g,m,i,x:a[0],y:a[1],z:a[2],sx:a[3],ry:a[4],sy:a[5],r:tp.r,th:tp.th,H:tp.H}));
    if(rk)list.forEach((a,i)=>rocks.push({g,m,i,x:a[0],y:a[1],z:a[2],s:a[3],ry:a[4],sy:a[5],tx:a[7]||0,tz:a[8]||0,hits:0}));
    m.castShadow=shadow;m.receiveShadow=true;g.add(m);
  };
  mkInst(VEG.pine,vegM,Lpine,true,{r:.42,th:13,H:15});mkInst(VEG.pineS,vegM,LpineS,true,{r:.42,th:13,H:15});mkInst(VEG.tree,vegM,Ltree,true,{r:.32,th:3.2,H:6});mkInst(VEG.jungle,vegM,Ljung,true,{r:.6,th:18,H:22});mkInst(VEG.acacia,vegM,Lacac,true,{r:.32,th:4.4,H:5});mkInst(VEG.palm,vegM,Lpalm,true,{r:.3,th:6,H:7});mkInst(VEG.cactus,vegM,Lcact,true,{r:.35,th:3,H:5});mkInst(rockG,rockV,Lrock,true,null,true);
  if(Lseq.length){                                                 // 背が高いので、描画の範囲（球）は上に大きく取る
    const gs=VEG.seq.clone();gs.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx*CHUNK+CHUNK/2,50,cz*CHUNK+CHUNK/2),95);geos.push(gs);
    const ms=new THREE.InstancedMesh(gs,vegM,Lseq.length);
    Lseq.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,a[4],0);dummy.scale.set(a[3],a[5],a[3]);dummy.updateMatrix();ms.setMatrixAt(i,dummy.matrix);ms.setColorAt(i,a[6])});
    ms.castShadow=true;ms.receiveShadow=true;g.add(ms);
  }
  const mkH=(geo,list)=>{if(!list.length)return;const gg=geo.clone();gg.boundingSphere=new THREE.Sphere(vctr,64);geos.push(gg);const m=new THREE.InstancedMesh(gg,HUT_M,list.length);
    list.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,a[6],0);dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,a[7])});m.castShadow=true;m.receiveShadow=true;g.add(m)};
  mkH(HUT_B,hutB);mkH(HUT_C,hutC);
  if(empWalls.length){
    const wm=new THREE.InstancedMesh(boxG,WALL_M,empWalls.length);
    empWalls.forEach((a,i)=>{dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(0,a[6],0);dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();wm.setMatrixAt(i,dummy.matrix);wm.setColorAt(i,a[7]);circ.push([a[0],a[2],Math.max(a[3]/2,4.5)])});
    wm.frustumCulled=false;wm.castShadow=wm.receiveShadow=true;g.add(wm);
  }
  ruinMesh(g,geos,circ,cx,cz);
  g.userData.geo=geo;g.userData.geos=geos;g.userData.circ=circ;g.userData.trees=trees;g.userData.rocks=rocks;g.userData.mat=terrain.material;
  scene.add(g);return g;
}
// ---------- 竜の骨（ランドマーク）。380m四方のセルごとに55%で1か所の候補が立ち、気候に合わせて選ばれた種類が竜の骨のときだけ置く（ほかの種類は削除済み） ----------
// 街・村・集落・川・火の汚染とは重ならず、範囲内の木と岩は置かない。
let LM_G=null,LM_M=null;
function lmInit(){
  if(LM_G)return;
  LM_G={b:new THREE.BoxGeometry(1,1,1),c:new THREE.CylinderGeometry(1,1,1,8),k:new THREE.ConeGeometry(1,1,5),s:new THREE.SphereGeometry(1,10,6),t:new THREE.CylinderGeometry(.7,1,1,6)};
  const L=(c,e)=>new THREE.MeshLambertMaterial(e?{color:c,emissive:e,emissiveIntensity:.35}:{color:c});
  LM_M={bone:L(0xe9e0c8)};
}
function lmSite(i,j){
  const key=i*100003+j;if(lmCache.has(key))return lmCache.get(key);
  let S=null;const r=mulberry(hash(i,j,SEED+9333)*1e9|0);
  const px=(i+.2+.6*r())*LM_C,pz=(j+.2+.6*r())*LM_C,pr=r(),tp=r();
  if(pr<.55){
    const ok=(x,z)=>{const h=heightAt(x,z);return h>WATER+3&&h<110&&mtBump(x,z)<=0&&townW(x,z)===0&&villageDist(x,z)>=50&&riverEff(x,z)>=14&&!(caravanClear(x,z)||twClear(x,z))&&!nomadClear(x,z)&&!campClear(x,z)&&!tribeClear(x,z)&&!rgClear(x,z)&&!fireClear(x,z)};
    let good=true,lo=1e9,hi=-1e9;
    for(let k=0;k<9&&good;k++){const a=k*.785,d=k?22:0,x=px+Math.cos(a)*d,z=pz+Math.sin(a)*d;good=ok(x,z);const h=heightAt(x,z);lo=Math.min(lo,h);hi=Math.max(hi,h)}
    const q=ruinSite(Math.floor(px/RUIN_C),Math.floor(pz/RUIN_C));if(q&&q.x!==undefined&&Math.hypot(q.x-px,q.z-pz)<110)good=false;
    if(good&&hi-lo<14){
      const c=climateAt(px,pz),w={henge:c.gr+c.st+c.cg+c.ta+c.bf+.2*c.tg,bones:c.de+c.sv+.5*c.gr,colossus:c.de+.6*c.sv+.3*c.st,arch:c.de+c.sv+.5*c.tu+.3*c.cg,obelisk:1.2*c.de+.3*c.sv,crystal:c.tu+c.ta+c.ic+.5*c.cg,mush:c.tf+c.tg+c.jg+.4*c.bf,floaters:.25};
      let tot=0;for(const k in w)tot+=w[k];let t=tp*tot,ty='henge';for(const k in w){t-=w[k];if(t<=0){ty=k;break}}
      if(ty==='bones')S={x:px,z:pz,ty,R:LM_RAD[ty],seed:hash(i,j,SEED+9334)*1e9|0};
    }
  }
  lmCache.set(key,S);return S;
}
function lmClear(x,z){const S=lmSite(Math.floor(x/LM_C),Math.floor(z/LM_C));return !!S&&Math.hypot(x-S.x,z-S.z)<S.R}
function lmBuild(S){
  lmInit();
  const g=new THREE.Group(),circs=[],bob=[],r=mulberry(S.seed),G=LM_G,M=LM_M,X=S.x,Z=S.z,ty=S.ty,Y=heightAt,TAU=6.283;let tgt=g;
  const put=(geo,mat,x,y,z,sx,sy,sz,rx,ry,rz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx||0,ry||0,rz||0);m.castShadow=true;tgt.add(m);return m};
  const limb=(ax,ay,az,bx,by,bz,rad,mat)=>{const d=new THREE.Vector3(bx-ax,by-ay,bz-az),L=d.length(),m=new THREE.Mesh(G.c,mat);m.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);m.scale.set(rad,L,rad);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());m.castShadow=true;g.add(m)};
  if(ty==='bones'){                                                // 竜の骨: 椎骨を一つずつ並べた背骨（棘突起・横突起）、先細りの肋骨、骨盤と四肢、首（頭は無し）
    const a=r()*TAU,ca=Math.cos(a),sa=Math.sin(a),PI=Math.PI,P=(u,v)=>[X+ca*u-sa*v,Z+sa*u+ca*v],sm=t=>t*t*(3-2*t);
    const Q=(u,v,h)=>{const[x,z]=P(u,v);return[x,Y(x,z)+h,z]};
    const sh=u=>u<-9?.8+2.6*sm((u+29)/20):u<11?3.4+.95*Math.sin(PI*(u+9)/20):3.4+1.8*Math.sin((u-11)/10*PI)-1.2*(u-11)/10;   // 背骨の高さ（尾は地面へ下がり、胸で盛り上がり、首は持ち上がって頭が地面へ）
    const sv=u=>u<-9?2.4*Math.sin(u*.27)*Math.min(1,(-9-u)/8):u>11?1.6*Math.sin((u-11)/10*PI):0;                           // 尾と首の横のゆるいうねり
    const tl=(A,B,rad,geo)=>{const d=new THREE.Vector3(B[0]-A[0],B[1]-A[1],B[2]-A[2]),L=d.length(),m=new THREE.Mesh(geo||G.t,M.bone);   // 先細りの骨（Aが太くBが細い）。geo=G.kなら爪・牙のように尖る
      m.position.set((A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2);m.scale.set(rad,L,rad);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());m.castShadow=true;g.add(m)};
    const ball=(p,s)=>put(G.s,M.bone,p[0],p[1],p[2],s,s,s);
    // 背骨: 椎体（円柱）＋背の棘突起（尾側へ傾く）＋左右の横突起
    for(let u=-29;u<=21;u+=1.55){const[x,z]=P(u,sv(u)),y=Y(x,z)+sh(u),s=u<-9?.35+.75*sm((u+29)/20):u<11?1.05+.2*Math.sin(PI*(u+9)/20):1.05-.3*(u-11)/10;
      put(G.c,M.bone,x,y,z,s,1.2,s,0,-a,PI/2);
      const hh=s*(u>-8&&u<10?2.3:1.25);put(G.k,M.bone,x,y+s*.75+hh/2,z,.2+.1*s,hh,.2+.1*s,0,-a,.3);
      if(s>.55&&u<14)put(G.b,M.bone,x,y-.05,z,.35,.28,s*2.5,0,-a,0)}
    // 肋骨: 背骨から外へ張り出して地面へ下りる先細りのアーチ（胸の中ほどが一番長い）
    for(let u=-7;u<=9;u+=2.1){const k0=(u-1)/11,rr=5.3*Math.sqrt(Math.max(0,1-k0*k0))+.9,g0=Q(u,0,0)[1],top=sh(u)-.35;
      for(const sd of[-1,1]){let pv=null;for(let k=0;k<=6;k++){const t=k/6*1.5,[x,z]=P(u,sd*rr*Math.sin(t)),p=[x,Math.max(Y(x,z)-.25,g0+top-(top+.2)*(1-Math.cos(t))/.93),z];
        if(pv)tl(pv,p,.44-.24*k/6);pv=p}}}
    // 骨盤（左右の腸骨）と肩甲骨
    for(const sd of[-1,1]){const p=Q(-9.5,sd*1.6,sh(-9.5)-.5);put(G.b,M.bone,p[0],p[1],p[2],3.8,.55,1.2,0,-a+sd*.5,0);
      const q=Q(7.5,sd*2.1,sh(7.5)-1.1);put(G.b,M.bone,q[0],q[1],q[2],3.3,.35,1.5,0,-a-sd*.45,sd*.4)}
    // 四肢: 付け根→関節→足首→爪。投げ出されて地面に横たわる
    for(const sd of[-1,1]){
      const H=Q(-9,sd*2.2,2.9),K=Q(-5.8,sd*5.4,1),Ak=Q(-11,sd*6.4,.55);                // 後ろ脚
      tl(H,K,.72);ball(K,.85);tl(K,Ak,.55);ball(Ak,.65);
      for(let j=-1;j<=1;j++)tl(Ak,Q(-7.8,sd*(6.4+j*1.2),.35),.3,G.k);
      const S=Q(8.5,sd*2.5,3.1),E=Q(5.2,sd*5.8,1),W=Q(10,sd*6.8,.5);                   // 前脚
      tl(S,E,.62);ball(E,.75);tl(E,W,.5);ball(W,.6);
      for(let j=-1;j<=1;j++)tl(W,Q(12.8,sd*(6.8+j*1.2),.35),.28,G.k)}
  }
  g.userData={x:X,z:Z,circs,bob};return g;
}
function updateLms(){                                                    // プレイヤーの近く(330m以内)のランドマークだけ作る
  const ix=Math.floor(player.x/LM_C),iz=Math.floor(player.z/LM_C),keep=new Set();
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const S=lmSite(ix+a,iz+b);if(!S)continue;
    const d=Math.hypot(S.x-player.x,S.z-player.z),key=(ix+a)+','+(iz+b);
    if(d<330||(d<420&&lmGroups.has(key))){keep.add(key);if(!lmGroups.has(key)){const g=lmBuild(S);scene.add(g);lmGroups.set(key,g)}}
  }
  for(const[k,g] of lmGroups)if(!keep.has(k)){scene.remove(g);lmGroups.delete(k)}
}
function clearLms(){for(const g of lmGroups.values())scene.remove(g);lmGroups.clear()}
function lmAnimate(t){for(const g of lmGroups.values())for(const b of g.userData.bob){b[0].position.y=b[1]+Math.sin(t*.8+b[2])*.8;b[0].rotation.y+=.003}}
  nempCache.clear();placeObj=null;ruinCache.clear();mtRuinCache.clear();skyReset();clearVillages();FLD.clear();FLDV.clear();mtCache.clear();contCache.clear();_ctI=NaN;_ctJ=NaN;RVH.clear();LKH.clear();waterReset();_mbIx=NaN;_rvIx=NaN;
  lotCache.clear();townCache.clear();cvCache.clear();_cvIx=NaN;empCache.clear();clearPalaces();clearCaravans();twCache.clear();_twIx=NaN;clearTowerCities();nmCache.clear();_nmIx=NaN;clearNomads();cpCache.clear();fireCache.clear();clearFires();iceCache.clear();clearIces();thuCache.clear();clearThus();drkCache.clear();clearDrks();lmCache.clear();clearLms();_cpIx=NaN;clearCamps();tbCache.clear();_tbIx=NaN;clearTribes();rgCache.clear();_rgIx=NaN;clearRGates();
return {PAL_M,GATE_M,updatePalaces,colorFor,ruinSite,ruinSolidsAt,mtRuinSite,skySite,updateSkyRuins,fireSite,updateFires,fireAnimate,iceSite,updateIces,iceAnimate,thuSite,updateThus,thuAnimate,drkSite,drkEnv,updateDrks,drkAnimate,makeChunk,lmSite,updateLms,lmAnimate,terrainReset};
 }
};
