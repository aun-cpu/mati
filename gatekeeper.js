/* gatekeeper.js — ゲートキーパー（ゲートの前に立つ番人）のコード（index.html から分離）。
   index.html の、メインの <script> のあとの <script src="gatekeeper.js"> で読み込まれる。このファイルが無いとゲートキーパーは動かない（index.html と同じフォルダに置く）。
   モジュールではなく普通のスクリプトなので、index.html 側の関数・定数・変数（scene・player・SSW・creatures など）はそのまま使えて、
   index.html からもここの関数（gkTick・gkAI・makeGkHuman・updateGatekeeperHud など）をそのまま呼べる。
   中のコードは index.html から切り出したままで、動きは変えていない。順番も元のまま。
   含むもの:
     1. 武器型（槍・双剣・四刀流・戦闘斧・大剣）と、突進・跳躍などの動く攻撃（SPR / DW / QD / MV / AXE / GSW）
     2. 軍人ゲートキーパーの属性エフェクト・魔法オーラ・溶ける演出（GKFX / GKAURA / GKMELT）
     3. 体・服・装飾・作り方（gkRollSpec / GKH / makeGkHuman / gkStyleBuild / gkStylePose）
     4. 本体（GK / gkTick / gkAI / GKA = 追加属性の攻撃 / GKSW = 剣の個性 / 盾 SHD）
     5. 武器の3Dモデル（makeGkSpear / makeGkAxe / makeGkSword / makeGkGreat）
     6. HUD（updateGatekeeperHud）
     7. いちばん最後: 敵の魔法の見た目・相殺の色へゲートキーパーの属性を足す2か所（もとは index.html の中にあり、GKA_COL を読むのでここへ移した）
   ゲートキーパーの見た目・攻撃・確率を変える時は、このファイルだけを見ればよい。 */
// ---------- ゲートキーパーの槍型: 右手に大きな槍。通常攻撃は槍を腰だめから突き出す（細い範囲に当たる・近づいて突く）。魔法は槍を立てて持ち、撃つ瞬間に真上へ突き上げる。姿勢は [腕の前後の回転, 槍の曲がり, 体の傾き, 腕の左右の振り, 0]（刃の向き＝腕＋曲がり。0=真下 -π/2=正面 -π=真上） ----------
const SPR={SCALE:1.7,WIDE:1.5,GRIP:.5,ATK:70,REACH:4.8,ARC:.3,START:4.4,STOP:3.6,WIND:.4,THRUST:.1,HIT:.5,RECOV:.35};   // SCALE=槍の大きさ(元の槍の何倍か) / WIDE=柄と穂先の太さの倍率 / GRIP=握る位置（柄の下端から、元の槍の長さ2.0に対する位置） / ATK=突きの物理攻撃力 / REACH=当たる距離(m) / ARC=正面から左右に当たる角度(rad・剣より細い) / START=この距離に入ったら突き始める(m) / STOP=この距離まで近づく(m) / WIND=腰へ引く秒 / THRUST=突く秒 / HIT=突きの何割で当たるか / RECOV=突いたあとの戻り(秒)
const SPR_REST=[-.25,-2.89,0,0,0],SPR_READY=[-.95,-.65,0,0,0],SPR_WIND=[-.4,-1.25,.1,0,0],SPR_THR=[-1.55,-.05,-.14,0,0],SPR_CHG=[-1.5,-1.64,-.02,0,0],SPR_UP=[-2.75,-.39,-.08,0,0],SPR_SWP0=[-1.1,-.5,-.12,-1.7,0],SPR_SWP1=[-1.1,-.5,.1,1.2,0];   // 薙ぎ払い: 槍を水平にして右へ引く → 左へ大きく払う
Object.assign(SPR,{SWP_WIND:.5,SWEEP:.24,SREACH:4.6,SARC:.4,SATK:.9,RAPID_N:3,RAPID_SPD:1.7,RAPID_K:.6});   // 薙ぎ払い: SWP_WIND=引く秒 / SWEEP=払う秒 / SREACH=当たる距離(m) / SARC=槍が相手の向きを通る時に当たる幅(rad) / SATK=ダメージ倍率（突きに対して） / 連続突き: RAPID_N=突く回数 / RAPID_SPD=2回目以降の速さ / RAPID_K=1回あたりのダメージ倍率   // 立てて持つ(普通) / 構え(敵対中・槍先を正面へ) / 引き(突く前) / 突き / 魔法を溜める（胸の前で槍を立てる） / 突き上げ（頭上へ）
// ---------- ゲートキーパーの双剣型: 両手に片手剣より少し小さい剣。攻撃は2本の剣を体の前でクロスさせる（クロス斬り下ろし=頭上でV字に構えて、X字に交差させて斬り下ろす / クロス薙ぎ=左右へ大きく開いて、はさみのように閉じて払う）。魔法は両手の剣を頭上へ掲げる。左手の剣は右手の姿勢を左右反転して動かす ----------
const DW={SCALE:1.8,ATK:45,REACH:3.4,ARC:.7,START:3.6,STOP:2.6,WIND:.45,SLASH:.12,HIT:.55,SWEEP:.22,SREACH:3.8,SARC:.4,SK:1.5,RECOV:.3};   // SCALE=剣の大きさ(片手剣は2.2) / ATK=剣1本ぶんの攻撃力（斬り下ろしは2本が時間差で当たる） / REACH・ARC=斬り下ろしの当たる距離(m)と角度(rad) / START=この距離で振り始める(m) / STOP=この距離まで近づく / WIND=構える秒 / SLASH=斬り下ろす秒 / HIT=斬り下ろしの何割で当たるか / SWEEP=薙ぎの秒 / SREACH・SARC=薙ぎの距離と幅 / SK=薙ぎ1回のダメージ（ATKに対する倍率・2本ぶん） / RECOV=振ったあとの戻り(秒)
const DW_REST=[-.2,-1.1,0,-.12,0],DW_READY=[-1,-.65,0,-.3,0],DW_UP=[-2.4,-.74,-.2,-.7,0],DW_END=[-.5,-.7,.3,.55,0],DW_SUP=[-1.1,-.47,-.12,-1.7,1],DW_SEND=[-1.1,-.47,.1,1.2,1];   // 腕の姿勢（右手。左手は左右の振りを反転）: 下げて持つ / 構え（剣先を正面・少し開く） / 頭上でV字（斬り下ろす前・魔法） / 前で交差（斬り下ろしの終わり） / 薙ぎの引き（左右へ開く） / 薙ぎの振り抜き（交差）
// ---------- ゲートキーパーの四刀流（腕が4本の時だけ）: 4本の手すべてに剣。攻撃は「2本を使うクロス」を、上の2本 → 下の2本の順で二連続で行う（上の2本が振り下ろす間に、下の2本が頭上で構えて待ち、すぐ続けて振る）。魔法は4本とも頭上へ掲げる ----------
const QD={K:.65,GAP:.18,YAW:.16};   // K=剣1本あたりのダメージ倍率（双剣の攻撃力DW.ATKに対して。4本ぶん当たるので小さめ） / GAP=上の2本が振り終わってから下の2本が振り始めるまでの間(秒) / YAW=下の2本が上の2本より外へ開く量(rad)
let gkSpearModel=null,gkAxeModel=null,gkGreatModel=null;
// ---------- 軍人系ゲートキーパー（剣・槍・双剣・四刀流・斧）の「動く攻撃」: 棒立ちで振るだけでなく、①突進(dash): 構えて一気に駆け寄り、勢いのまま武器ごとの攻撃（剣=叩きつけ / 槍=突き / 双剣・四刀流=クロス斬り / 斧=叩き割り）を当てる ②跳躍叩きつけ(leap): しゃがんで大きく跳び、相手のいた所へ落ちて武器を叩きつける（着地点のまわり全体に当たる）----------
const MV={DASH:{WIND:.4,SPD:19,MAX:.7,OVER:1.2,R:12,MIN:4.8,REC:.5},LEAP:{WIND:.25,V0:20.5,G:64,R:11,MIN:4.5,REC:.5,RAD:5,K:1.15}};   // DASH: OVER=相手の位置を通り過ぎて走る距離(m。向きは構えの終わりで固定＝横へ動けばかわせる) WIND=構える秒 SPD=駆ける速さ(m/s) MAX=駆ける最長(秒) R=この距離以内から出す(m) MIN=これより近い時は出さない(m) REC=当てたあとの隙(秒) / LEAP: WIND=しゃがむ秒 V0=跳び上がる初速(上へ) G=跳躍中の重力（大きいほど速く跳んで落ちる。高さ=V0²/2G≒3.3m・滞空≒0.64秒） R・MIN=出す距離 RAD=着地の衝撃が当たる半径(m) K=ダメージ倍率（武器の攻撃力に対して）
const SPR_DOWN=[-.9,.55,.3,0,0];   // 槍を斜め下へ向けて落ちる姿勢
function mvWeapon(c){                                                // 武器ごとの値: atk=1回ぶんの攻撃力 / stop=駆け寄って止まる距離 / wind=構え / rush=駆けている時 / air=跳んでいる間 / slam=叩きつけ
  return c.gkAxe?{atk:gswK(c).ATK,stop:gswK(c).STOP,wind:AX_UP,rush:AX_END,air:AX_UP,slam:AX_END}
    :c.gkSpear?{atk:SPR.ATK,stop:SPR.STOP,wind:SPR_WIND,rush:SPR_THR,air:SPR_UP,slam:SPR_DOWN}
    :(c.gkDual||c.gkQuad)?{atk:DW.ATK*2,stop:DW.STOP,wind:DW_UP,rush:DW_END,air:DW_UP,slam:DW_END}
    :{atk:SSW.ATK,stop:SSW.STOP,wind:SSW_UP,rush:SSW_END,air:SSW_UP,slam:SSW_END}}
function mvStep(c,dx,dz,dl){                                          // 水平に動く（壁・段差・相手にめり込む時は動かない）。動けたら true
  const nx=c.x+dx*dl,nz=c.z+dz*dl;if(Math.hypot(player.x-nx,player.z-nz)<SSW.MINPD)return false;
  if(solidAt(nx,c.y+1,nz)||solidAt(nx,c.y+1.8,nz)||Math.abs(supportAt(nx,nz,c.y+(c.jy||0)+.3)-c.y)>1.2)return false;c.x=nx;c.z=nz;return true}
function mvStrike(c){                                                // 突進の最後の一撃: 武器ごとの普通の攻撃の当たり判定をそのまま使う
  if(c.gkAxe)axeHit(c);else if(c.gkSpear)spearHit(c,1);else if(c.gkDual||c.gkQuad){const k=c.gkQuad?QD.K:1;dualHit(c,true,k);dualHit(c,false,k)}else soldierHit(c)}
function mvSlam(c){                                                  // 跳躍の着地: 着地点のまわり全体に衝撃（半径 RAD）。砂煙の輪と属性の衝撃
  const L=MV.LEAP,wp=mvWeapon(c);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=1.6+Math.random()*2;addSmoke(c.x+Math.cos(a)*r,c.y+.2+Math.random()*.4,c.z+Math.sin(a)*r,.3+Math.random()*.35,GOLEM.DUST)}
  if(audioSamples.armorSample)playSample('armorSample',.8);shakeT=Math.max(shakeT||0,.35);shakeA=Math.max(shakeA||0,.12);
  {const el=sswElem(c);if(el!=='dark'){try{JFX.impact(c.x,c.y,c.z,{cols:gkPal(el),power:1.6,shards:16,spikes:(el==='fire'||el==='ice'||el==='d')?8:0,arcs:el==='thunder'?5:0,dome:true,shake:false})}catch(e){}}}
  if(STAT.dead)return;
  const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz);
  if(d<L.RAD&&Math.abs((player.gy!==undefined?player.gy:c.y)-c.y)<2.5){playerPhys(wp.atk*L.K*(c.swDmgK||1),c);soldierElem(c)}}
function mvSwing(c,dt,face){                                         // 突進(dash)・跳躍叩きつけ(leap)の進行（毎フレーム）。c.mvPh = wind(構え) → rush(駆ける) / air(跳んでいる) → rec(隙)
  if(c.hp<=0||c.dead!==undefined){c.swT=-1;c.mvPh=null;return}
  c.swT+=dt*(c.swSpd||1);const dash=c.swKind==='dash',D=MV.DASH,L=MV.LEAP,wp=mvWeapon(c),W=dash?D.WIND:L.WIND;
  const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz)||1,end=()=>{c.cmbLeft=0;c.swSpd=1;c.swT=-1;c.mvPh=null;c.swWait=(SSW.WAIT[0]+Math.random()*SSW.WAIT[1])*(c.gk?GKA.WAITK:1)};
  if(c.mvPh==='wind'){
    face(.9);if(c.swT<W)return;
    c.mvT=0;if(typeof swingSound==='function')swingSound({id:'sword'},0);
    for(let i=0;i<6;i++)addSmoke(c.x+(Math.random()-.5)*1.4,c.y+.2+Math.random()*.3,c.z+(Math.random()-.5)*1.4,.25+Math.random()*.25,GOLEM.DUST);
    if(dash){c.mvPh='rush';c.mvDx=dx/d;c.mvDz=dz/d;c.mvLen=Math.max(0,d-wp.stop)+D.OVER;c.yaw=pwYawTo(dx,dz);return}   // 突進の向きと距離はここで固定（追いかけて曲がらない）
    const Ta=2*L.V0/L.G,dd=Math.max(0,Math.min(d-1.8,L.R)),vh=dd/Ta;   // 跳躍: 相手のいる所（いまの位置）を目がけて、1回の跳びで届く速さで進む
    c.mvVx=dx/d*vh;c.mvVz=dz/d*vh;c.jg=L.G;c.jv=L.V0;c.jy=.02;c.mvPh='air';return}
  if(c.mvPh==='rush'){                                               // 突進: 相手を追って向きを変えながら、止まる距離まで駆け寄る
    c.mvT+=dt;
    let moved=false;if(d>wp.stop&&c.mvLen>0){const st=Math.min(D.SPD*dt,c.mvLen);moved=mvStep(c,c.mvDx,c.mvDz,st);if(moved)c.mvLen-=st;
      addSmoke(c.x-c.mvDx*.8+(Math.random()-.5)*.8,c.y+.2,c.z-c.mvDz*.8+(Math.random()-.5)*.8,.2+Math.random()*.2,GOLEM.DUST);   // 足元の砂煙が後ろへ流れる
      try{const el=sswElem(c);gkPart(el,c.x,c.y+1.2+Math.random(),c.z,-c.mvDx*2,Math.random(),-c.mvDz*2,.3,.18,gkFlameMats(GKA_COL[el]||0xffffff))}catch(er){}}
    if(d<=wp.stop+.05||!moved||c.mvLen<=0||c.mvT>D.MAX){
      if(d<=wp.stop+.5)c.yaw=pwYawTo(dx,dz);mvStrike(c);shakeT=Math.max(shakeT||0,.15);shakeA=Math.max(shakeA||0,.05);c.mvPh='rec';c.mvT=0}
    return}
  if(c.mvPh==='air'){                                                // 跳躍: 空中で前へ進み、着地したら叩きつけ
    c.mvT+=dt;if(!mvStep(c,c.mvVx,c.mvVz,dt)){c.mvVx=0;c.mvVz=0}
    if((c.mvT>.15&&!(c.jy>0))||c.mvT>1.6){c.jy=0;c.jv=0;c.jg=0;mvSlam(c);c.mvPh='rec';c.mvT=0}
    return}
  c.mvT+=dt;if(c.mvT>=(dash?D.REC:L.REC))end()                       // rec: 当てたあとの隙
}
function mvPose(c,dt,READYP){                                        // 突進・跳躍の間の右腕・武器の姿勢（c.sPose）。四刀流は下の2本も同じ姿勢
  const wp=mvWeapon(c),L=MV.LEAP,D=MV.DASH,ph=c.mvPh,dash=c.swKind==='dash';let P;
  if(ph==='wind')P=sswMix(READYP,dash?wp.wind:wp.air,pwSmooth(Math.min(1,c.swT/(dash?D.WIND:L.WIND))));
  else if(ph==='rush')P=sswMix(c.sPose,wp.rush,Math.min(1,dt*16));
  else if(ph==='air'){const u=Math.min(1,c.mvT/(2*L.V0/L.G));P=u<.4?wp.air.slice():sswMix(wp.air,wp.slam,pwSmooth(Math.min(1,(u-.4)/.45)))}   // 上がる間は掲げ、落ちながら叩きつけの姿勢へ
  else P=sswMix(dash?wp.rush:wp.slam,READYP,pwSmooth(Math.min(1,c.mvT/(dash?D.REC:L.REC))));
  c.sPose=P;if(c.gkQuad){c.q2Act=true;c.sPose2=P.slice()}}
// ---------- ゲートキーパーの戦闘斧型: 右手に大きな両刃の戦闘斧。通常攻撃は2つ ①振り下ろし(adown): 頭上へ振りかぶって地面ごと叩き割る（正面の扇形に当たる・砂煙と衝撃） ②斧投げ(throw): 振り下ろしの途中で斧を回しながら投げる（遠距離・投げた斧は戻るまで手元に無い）。魔法は斧を頭上へ掲げる。姿勢は槍型と同じ [腕の前後の回転, 斧の曲がり, 体の傾き, 腕の左右の振り, 刃の寝かせ具合] ----------
const AXE={SCALE:1.55,WIDE:1.25,GRIP:.5,ATK:90,REACH:4.0,ARC:.75,START:3.6,STOP:2.8,WIND:.6,CHOP:.13,HIT:.55,RECOV:.5};   // SCALE=斧の大きさ / WIDE=柄と頭の太さの倍率 / GRIP=握る位置 / ATK=振り下ろしの物理攻撃力 / REACH・ARC=振り下ろしの当たる距離(m)と角度(rad) / START=この距離で振り始める(m) / STOP=この距離まで近づく / WIND=振りかぶる秒 / CHOP=振り下ろす秒 / HIT=振り下ろしの何割で当たるか / RECOV=振ったあとの戻り(秒)
const AX_REST=[-.25,-2.7,0,0,0],AX_READY=[-.7,-1.9,0,0,0],AX_UP=[-2.7,-1.15,-.22,0,0],AX_END=[-.4,-.9,.32,0,0];   // 担ぎ(普通) / 構え(敵対中) / 振りかぶり / 振り下ろし
// ---------- ゲートキーパーの大剣型: 幅広で長い大剣を肩に担ぐ。構え・振りかぶり・振り下ろしの姿勢は斧型と同じ（c.gkAxe の仕組みをそのまま使い、c.gkGreat で数値・攻撃を差し替える）。通常攻撃は2つ ①叩き割り(adown): 重く振りかぶって地面ごと叩き割る（斧より遅いが、正面の広い扇形・強い） ②薙ぎ払い(gsweep): 剣を寝かせて右へ引き、左へ大きく払う（広い範囲・距離が長い）。魔法は大剣を頭上へ掲げる ----------
const GSW={SCALE:2.5,WIDE:1.3,GRIP:.18,ATK:115,REACH:4.9,ARC:.95,START:4.3,STOP:3.4,WIND:.8,CHOP:.12,HIT:.55,RECOV:.75,SW_WIND:.7,SWEEP:.3,SREACH:5.6,SARC:.55,SK:.85,SRECOV:.7};   // SCALE=大剣の大きさ / WIDE=太さの倍率 / GRIP=握る位置 / ATK=叩き割りの物理攻撃力 / REACH・ARC=叩き割りの当たる距離(m)と角度(rad) / START=この距離で振り始める(m) / STOP=この距離まで近づく / WIND=振りかぶる秒 / CHOP=振り下ろす秒 / HIT=振り下ろしの何割で当たるか / RECOV=戻り(秒) / SW_WIND=薙ぎ払いの引き(秒) SWEEP=払う秒 SREACH・SARC=薙ぎ払いの距離(m)と刃が相手の向きを通る時の当たり幅(rad) SK=薙ぎ払いのダメージ倍率 SRECOV=払ったあとの戻り(秒)
const GS_REST=[-.95,-1.45,0,0,0],GS_READY=[-1.15,-1.09,0,0,0];   // 大剣の持ち方: 肩に担がず、両手で前へ伸ばして持つ（普通=切っ先が前上へ・構え=腕を少し高く）
const _gt2=new THREE.Vector3();
function gkTwoHand(c){   // 大剣型: 左腕を、右手の握りの柄頭側へ伸ばして添える（両手持ち。毎フレーム、右手の握りの位置へ左腕を向ける）
  const G=c.G;if(!G||!G.arms||!G.arms[0]||!G.arms[1]||!G.swB)return;
  const L=G.arms[1],Pa=L.parent;if(!Pa)return;
  G.arms[0].updateWorldMatrix(true,true);Pa.updateWorldMatrix(true,false);
  _gt2.set(0,.09,0);G.swB.localToWorld(_gt2);Pa.worldToLocal(_gt2);_gt2.sub(L.position);const d=_gt2.length();if(d<1e-4)return;_gt2.divideScalar(d);
  L.rotation.order='YXZ';L.rotation.x=-Math.acos(Math.max(-1,Math.min(1,-_gt2.y)));L.rotation.y=Math.atan2(_gt2.x,_gt2.z);L.rotation.z=0}
function gswK(c){return c.gkGreat?GSW:AXE}   // 斧と大剣で数値を切り替える（同じ名前の項目: ATK REACH ARC START STOP WIND CHOP HIT RECOV）
function axeHit(c){                                                  // 振り下ろした瞬間: 地面を叩き割る（正面へ砂煙が走る）。正面の扇形にプレイヤーがいれば当たる
  const ry=c.yaw-PEASANT_FLIP,px=c.x+Math.sin(ry)*3.2,pz=c.z+Math.cos(ry)*3.2;
  for(let i=0;i<10;i++)addSmoke(px+(Math.random()-.5)*2,c.y+.2+Math.random()*.5,pz+(Math.random()-.5)*2,.3+Math.random()*.35,GOLEM.DUST);
  for(let k=1;k<=4;k++)addSmoke(c.x+Math.sin(ry)*(3.2+k*1.4)+(Math.random()-.5)*.8,c.y+.2,c.z+Math.cos(ry)*(3.2+k*1.4)+(Math.random()-.5)*.8,.25+Math.random()*.2,GOLEM.DUST);   // 割れ目に沿った砂煙
  if(audioSamples.armorSample)playSample('armorSample',.7);
  {const el=sswElem(c);if(el!=='dark'){try{JFX.impact(px,c.y,pz,{cols:gkPal(el),power:c.gkGreat?1.9:1.4,shards:c.gkGreat?18:14,spikes:(el==='fire'||el==='ice'||el==='d')?7:0,arcs:el==='thunder'?5:0,dome:true,shake:false})}catch(e){}}}
  if(STAT.dead)return;
  const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz);let df=pwYawTo(dx,dz)-c.yaw;df=Math.atan2(Math.sin(df),Math.cos(df));
  {const K=gswK(c);if(d<K.REACH&&Math.abs(df)<K.ARC&&Math.abs((player.gy!==undefined?player.gy:c.y)-c.y)<2.5){playerPhys(K.ATK*(c.swDmgK||1),c);soldierElem(c)}}
}
function axeSwing(c,dt,face){                                        // 戦闘斧の攻撃の進行（毎フレーム）。swKind: 'adown'=振り下ろし（c.swRanged='throw'なら斧投げ）
  c.swT+=dt*(c.swSpd||1);const T=c.swT,wait=()=>{c.swRanged=null;c.cmbLeft=0;c.swSpd=1;c.swT=-1;c.swWait=(SSW.WAIT[0]+Math.random()*SSW.WAIT[1])*(c.gk?GKA.WAITK:1)};
  if(c.swKind==='gsweep'){const G2=GSW,W=G2.SW_WIND,S=G2.SWEEP;   // 大剣の薙ぎ払い: 引いている間は相手を追って向く。払っている間、刃が相手のいる向きを通った瞬間に当たる
    if(T<W)face(.5);
    if(!c.swSnd&&T>=W){c.swSnd=true;if(typeof swingSound==='function')swingSound({id:'sword'},0)}
    if(!c.swHit&&T>=W&&T<W+S&&!STAT.dead&&c.sPose){
      const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz);let df=pwYawTo(dx,dz)-c.yaw;df=Math.atan2(Math.sin(df),Math.cos(df));
      if(d<G2.SREACH&&Math.abs(df-c.sPose[3])<G2.SARC&&Math.abs((player.gy!==undefined?player.gy:c.y)-c.y)<2.5){c.swHit=true;if(audioSamples.armorSample)playSample('armorSample',.6);shakeT=Math.max(shakeT||0,.2);shakeA=Math.max(shakeA||0,.07);playerPhys(G2.ATK*G2.SK*(c.swDmgK||1),c);soldierElem(c)}}
    if(T>=W+S+G2.SRECOV)wait();return}
  if(c.swKind==='adown'){const K=gswK(c),W=K.WIND,S=K.CHOP;
    if(T<W){face(.5);c.swRangedDone=false}                           // 振りかぶっている間は相手を追って向く
    if(!c.swSnd&&T>=W){c.swSnd=true;if(typeof swingSound==='function')swingSound({id:'sword'},0)}
    if(c.swRanged&&!c.swRangedDone&&T>=W+S*.3){c.swRangedDone=true;gkSwFire(c)}   // 斧投げ: 振り下ろしの途中で飛ばす
    if(!c.swHit&&T>=W+S*K.HIT){c.swHit=true;if(!c.swRanged)axeHit(c)}
    if(T>=W+S+K.RECOV)wait();return}
}
// ---------- 軍人ゲートキーパーの第一属性エフェクト（見やすい版）: 体のまわりに大きな粒を常に出し、足元に属性色の光の輪、巨大な剣は刃の色を少し寄せるだけ（敵対していなくても出る） ----------
const GKFX={BODY:46,SZ:[.16,.16],NEAR:90},GKFX_MATS={};   // BODY=体の粒が1秒に出る数 / SZ=粒の大きさ[最小,幅](m・体の大きさにかかる) / NEAR=この距離(m)より遠いと出さない
function gkFxMats(k,col){
  if(GKFX_MATS[k])return GKFX_MATS[k];
  const dark=k==='dark',bl=dark?THREE.NormalBlending:THREE.AdditiveBlending,cols=dark?[0x8a45e0,0x5a2a9a,0xc090ff]:k==='ice'?[0xe8f8ff,0xbff0ff,0x9fdcff]:(MAGC[k]||[col,relicShade(col,.75),new THREE.Color(col).lerp(new THREE.Color(0xffffff),.3).getHex()]);   // 闇は黒でなく明るい紫（暗い所でも見える）
  return GKFX_MATS[k]=cols.map(h=>new THREE.MeshBasicMaterial({color:h,transparent:true,opacity:.95,blending:bl,depthWrite:false}));
}
function soldierGkFx(c,dt){   // 軍人ゲートキーパー: 常時のオーラ（体の粒・足元の輪）は廃止。剣の刃の色を属性色へ少し寄せるだけ（オーラは魔法を使っている間だけ gkMagicAura が出す）
  const G=c.G,k=c.gkFirst;if(!G||!k||c.gkSwTint||!G.swB)return;
  const col=GKA_COL[k]!==undefined?GKA_COL[k]:0xffffff;
  c.gkSwTint=true;const tc=new THREE.Color(k==='dark'?0x6a30b0:col);   // この個体だけ（材質は複製）
  for(const SB of[G.swB,G.swB2,G.swB3,G.swB4])if(SB)SB.traverse(m=>{if(!m.isMesh||!m.material||!m.material.color)return;m.material=m.material.clone();m.material.color.lerp(tc,.3);if(m.material.emissive)m.material.emissive.copy(tc).multiplyScalar(.12)})
}
// ---------- ゲートキーパーの魔法オーラ（全タイプ共通）: 魔法を使っている最中（光を溜める・撃つ・追加属性の攻撃）だけ、体のまわりにその属性の粒が出る。使う属性が二つ（組み合わせ攻撃）なら二つ出る ----------
const GKAURA={RATE:46,SZ:[.16,.16],NEAR:90};   // RATE=1属性が1秒に出す粒の数 / SZ=粒の大きさ[最小,幅](m・体の大きさにかかる) / NEAR=この距離(m)より遠いと出さない
function gkMagicEls(c){   // いま使っている魔法の属性の一覧（重複なし）
  const out=[];const add=e=>{if(e&&out.indexOf(e)<0)out.push(e)};
  if(c.bT>=0)add(c.spell);   // 普通の魔法（第一属性）
  if(c.spT>=0&&c.spAtk){const cb=c.spAtk.combo&&GKA.COMBO&&GKA.COMBO[c.spAtk.atk];if(cb&&cb.need)cb.need.forEach(add);else add(c.spAtk.el)}   // 追加属性の攻撃（組み合わせ攻撃は必要な属性すべて）
  return out}
function gkMagicAura(c,dt){
  if(!c.gk||!c.gkFxAnchor||c.dead!==undefined||c.hp<=0)return;
  const els=gkMagicEls(c);if(!els.length)return;
  if(Math.hypot(player.x-c.x,player.z-c.z)>GKAURA.NEAR)return;
  const hs=c.gkFxAnchor.position.y/1.05||1,R=Math.random,P=new THREE.Vector3();
  c.gkFxAnchor.getWorldPosition(P);const bx=P.x,by=P.y,bz=P.z;
  c.gkAuraT=c.gkAuraT||{};
  for(const k of els){
    const col=GKA_COL[k]!==undefined?GKA_COL[k]:0xffffff,M=gkFxMats(k,col),fire=k==='fire'||k==='e',th=k==='thunder',ice=k==='ice',dk=k==='dark';
    c.gkAuraT[k]=(c.gkAuraT[k]||0)+dt*GKAURA.RATE;const n=Math.min(6,Math.floor(c.gkAuraT[k]));c.gkAuraT[k]-=n;
    for(let i=0;i<n;i++){
      const a=R()*6.283,r=(.4+R()*.5)*hs*1.3,x=bx+Math.cos(a)*r,y=by+(R()-.5)*1.9*hs,z=bz+Math.sin(a)*r;
      const s=(GKAURA.SZ[0]+R()*GKAURA.SZ[1])*hs;let vx=(R()-.5)*.5,vy=.3+R()*.5,vz=(R()-.5)*.5,life=.8+R()*.5;
      if(fire){vy=1.0+R()*1.2;life=.6+R()*.4}                                  // 火・爆破: 勢いよく昇る
      else if(th){vx=(R()-.5)*3;vy=(R()-.5)*3;vz=(R()-.5)*3;life=.22+R()*.2}   // 雷: ぱちっと散る
      else if(ice){vy=-.5-R()*.4;life=.9+R()*.5}                                // 氷: ゆっくり降る
      else if(dk){vy=.1+R()*.3;life=1.1+R()*.5}                                 // 闇: ゆっくり漂う
      addFirePart(x,y,z,vx,vy,vz,life,s*(th?.8:1),M,ice?iceGeo:k==='b'?squareGeo:k==='c'?ringGeo:k==='e'?spikeGeo:undefined)}}
}
// ---------- ゲートキーパーの「溶けて属性になる」: 回転（前宙・ドリル）・ジャンプ・素早い移動（突進・跳躍・踏み込み・瞬間移動・闇の飛行）の間は、体が半透明になって属性の光と一体化する（火なら体が溶けて炎になる）。通った道すじには、その時の姿勢の属性色の残像が残り、粒が尾を引く。止まると体が元に戻る。使う属性は、追加属性の攻撃の最中ならその属性・それ以外は第一属性 ----------
const GKMELT={SPD:6,IN:14,OUT:9,HOLD:.12,A:.8,EM:1.8,RATE:120,NEAR:90,GH_DT:.05,GH_LIFE:.45,GH_OP:.55,GH_MAX:28,TP:4.5};   // SPD=この速さ(m/秒)を超えたら素早い移動 / IN・OUT=溶ける・戻る速さ / HOLD=動きが終わってから戻り始めるまで(秒) / A=溶けきった時の透け具合(0〜1) / EM=光り具合 / RATE=粒の数(個/秒) / NEAR=この距離(m)より遠いと粒・残像は出さない / GH_DT=残像を置く間隔(秒) GH_LIFE=残像が消えるまで(秒) GH_OP=残像の濃さ GH_MAX=画面内の残像の最大数 / TP=これ以上一瞬で動いたら瞬間移動(m)
const gkGhosts=[],_gkMv=new THREE.Vector3();
function gkMeltEl(c){let k=(c.spT>=0&&c.spAtk&&c.spAtk.el)||c.gkFirst||'fire';if(k==='blast')k='a';return k}
function gkMeltCol(k){return k==='dark'?0x8a45e0:(GKA_COL[k]!==undefined?GKA_COL[k]:0xffffff)}
function gkMeltMats(c){const out=[],seen=new Set();   // 体・鎧・武器の材質（光る演出用の MeshBasic などは除く）
  c.g.traverse(o=>{if(!o.isMesh||o.userData.gkNoMelt)return;const arr=Array.isArray(o.material)?o.material:[o.material];for(const m of arr)if(m&&!seen.has(m)&&m.emissive&&m.blending===THREE.NormalBlending){seen.add(m);out.push(m)}});return out}
function gkMeltRestore(c){const S=c.gkMelt;c.gkMeltOn=false;if(!S||!S.saved)return;
  for(const v of S.saved){const m=v.m;m.opacity=v.op;m.transparent=v.tr;m.depthWrite=v.dw;m.emissive.copy(v.em);m.emissiveIntensity=v.ei;m.needsUpdate=true}
  S.saved=null;S.m=0}
function gkMeltApply(c,S,k){
  if(!S.saved){S.saved=gkMeltMats(c).map(m=>({m,tr:m.transparent,op:m.opacity,dw:m.depthWrite,em:m.emissive.clone(),ei:m.emissiveIntensity}));for(const v of S.saved){v.m.transparent=true;v.m.needsUpdate=true}c.gkMeltOn=true}
  const mm=S.m,col=new THREE.Color(gkMeltCol(k));
  for(const v of S.saved){const m=v.m;m.opacity=v.op*(1-GKMELT.A*mm);m.depthWrite=mm<.05?v.dw:false;m.emissive.copy(col);m.emissiveIntensity=v.ei+GKMELT.EM*mm}}
function gkGhostGeo(c){   // いまの姿勢（体・鎧・武器）を、足もとを原点にした1つの形にまとめる（描画は残像1つにつき1回）
  c.g.updateMatrixWorld(true);const ox=c.g.position.x,oy=c.g.position.y,oz=c.g.position.z,list=[];let tot=0;
  c.g.traverse(o=>{if(!o.isMesh||!o.geometry||!o.geometry.attributes.position||o.userData.gkNoMelt)return;
    for(let p=o;p;p=p.parent){if(!p.visible)return;if(p===c.g)break}   // 隠れている部品（投げて手元に無い武器など）は写さない
    const m=o.material;if(!m||Array.isArray(m)||!m.emissive||m.blending!==THREE.NormalBlending)return;
    const n=o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count;list.push(o,n);tot+=n});
  if(!tot)return null;
  const arr=new Float32Array(tot*3);let w=0;
  for(let q=0;q<list.length;q+=2){const o=list[q],n=list[q+1],ps=o.geometry.attributes.position,ix=o.geometry.index;
    for(let i=0;i<n;i++){_gkMv.fromBufferAttribute(ps,ix?ix.getX(i):i).applyMatrix4(o.matrixWorld);arr[w++]=_gkMv.x-ox;arr[w++]=_gkMv.y-oy;arr[w++]=_gkMv.z-oz}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(arr,3));return g}
function gkGhostKill(n){const e=gkGhosts[n];scene.remove(e.mesh);e.mat.dispose();if(--e.ref.n<=0)e.ref.geo.dispose();gkGhosts.splice(n,1)}
function gkGhostAdd(k,x,y,z,ref,life,op){
  const mat=new THREE.MeshBasicMaterial({color:gkMeltCol(k),transparent:true,opacity:op,blending:k==='dark'?THREE.NormalBlending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}),
    mesh=new THREE.Mesh(ref.geo,mat);mesh.position.set(x,y,z);mesh.frustumCulled=false;scene.add(mesh);ref.n++;
  while(gkGhosts.length>=GKMELT.GH_MAX)gkGhostKill(0);
  gkGhosts.push({mesh,mat,ref,t:0,life,op,k,y0:y})}
function gkGhostTick(dt){   // 残像: だんだん薄くなり、火などは昇りながら細く伸びて消える（氷は沈み、雷はちらつく）
  for(let n=gkGhosts.length-1;n>=0;n--){const e=gkGhosts[n];e.t+=dt;const u=e.t/e.life;if(u>=1){gkGhostKill(n);continue}
    const f=1-u,th=e.k==='thunder';e.mat.opacity=e.op*f*f*(th?.55+.45*Math.sin(e.t*70):1);
    e.mesh.position.y=e.y0+(e.k==='ice'?-.3:th?0:1.1)*e.t;e.mesh.scale.set(1-.18*u,th?1:1+.25*u,1-.18*u)}}
function gkMeltPuff(k,n,hs,bx,by,bz,spread,ys){   // 体から出る属性の粒（体の中のあちこちから出て、その場に残る＝動くと尾を引く）
  const col=gkMeltCol(k),M=gkFxMats(k,col),R=Math.random,fire=k==='fire'||k==='e',th=k==='thunder',ice=k==='ice',dk=k==='dark';
  for(let i=0;i<n;i++){
    const a=R()*6.283,r=R()*spread*hs,x=bx+Math.cos(a)*r,y=by+(R()-.5)*(ys===undefined?1.9:ys)*hs,z=bz+Math.sin(a)*r,s=(.2+R()*.2)*hs;let vx=(R()-.5)*.8,vy=.3+R()*.6,vz=(R()-.5)*.8,life=.7+R()*.4;
    if(fire){vy=1.2+R()*1.4;life=.6+R()*.4}else if(th){vx=(R()-.5)*4;vy=(R()-.5)*4;vz=(R()-.5)*4;life=.22+R()*.2}else if(ice){vy=-.5-R()*.4;life=.9+R()*.5}else if(dk){vy=.1+R()*.4;life=1+R()*.5}
    addFirePart(x,y,z,vx,vy,vz,life,s*(th?.8:1),M,ice?iceGeo:k==='b'?squareGeo:k==='c'?ringGeo:k==='e'?spikeGeo:undefined)}}
function gkMeltStep(c,dt){   // 毎フレーム: 動きを見て「溶ける量」を決め、体の透け・光り・粒・残像を付ける
  if(c.dead!==undefined||c.hp<=0||!c.g){if(c.gkMeltOn)gkMeltRestore(c);return}
  if(!(dt>0))return;
  const G=GKMELT,S=c.gkMelt||(c.gkMelt={m:0,hold:0,ghT:0,pt:0,px:c.x,py:c.y+(c.jy||0),pz:c.z,saved:null});
  const yy=c.y+(c.jy||0),dx=c.x-S.px,dz=c.z-S.pz,dy=yy-S.py,hd=Math.hypot(dx,dz),tele=Math.hypot(hd,dy)>G.TP&&dt<.25;   // tele=一瞬で大きく動いた（雷の瞬間移動）
  let want=false;
  if(c.fl&&c.fl.ph==='air')want=true;                                  // 前宙（飛び叩き・軍人の前宙）: 回りながら跳ぶ間
  else if(c.dr&&c.dr.ph!=='wind'&&c.dr.ph!=='land')want=true;          // ドリル: 飛び上がる・回る・突っ込む間
  else if(c.mvPh==='rush'||c.mvPh==='air')want=true;                   // 突進・跳躍叩きつけ
  else if(c.fz&&c.fz.fly)want=true;                                    // 闇の乱舞で飛んで近づく間
  else if((c.jy||0)>.3)want=true;                                      // そのほかのジャンプ
  else if(!(c.kv>1)&&hd/dt>G.SPD)want=true;                            // 素早い移動（殴られて押された時は除く）
  if(tele){want=true;S.hold=Math.max(S.hold,.35)}
  if(want)S.hold=Math.max(S.hold,G.HOLD);else S.hold-=dt;
  const tg=(want||S.hold>0)?1:0;S.m+=(tg-S.m)*Math.min(1,dt*(tg>S.m?G.IN:G.OUT));if(tg===0&&S.m<.02)S.m=0;
  const near=Math.hypot(player.x-c.x,player.z-c.z)<G.NEAR;
  if(S.m>0){
    const k=gkMeltEl(c);gkMeltApply(c,S,k);
    if(near){
      let ref=null;const getRef=()=>ref||(ref=(g=>g?{geo:g,n:0}:null)(gkGhostGeo(c)));
      if(tele&&getRef()){const N=4,gy=c.g.position.y-yy;for(let i=0;i<N;i++){const u=i/N;gkGhostAdd(k,S.px+dx*u,S.py+dy*u+gy,S.pz+dz*u,ref,G.GH_LIFE*(1.1+.3*(1-u)),G.GH_OP)}   // 瞬間移動: 元の場所から着地点までの道すじに残像
        const hs0=Math.max(.6,c.size||1);for(let i=0;i<=12;i++){const u=i/12;gkMeltPuff(k,3,hs0,S.px+dx*u,S.py+dy*u+hs0,S.pz+dz*u,.4)}}
      if(S.m>.3){S.ghT-=dt;if(S.ghT<=0){S.ghT=G.GH_DT;if(getRef())gkGhostAdd(k,c.g.position.x,c.g.position.y,c.g.position.z,ref,G.GH_LIFE,G.GH_OP*Math.min(1,S.m))}}   // 動いている間は一定間隔で、その時の姿勢の残像を置く
      if(ref&&ref.n<=0)ref.geo.dispose();
      S.pt+=dt*G.RATE*S.m;const n=Math.min(6,Math.floor(S.pt));S.pt-=n;
      if(n>0){const hs=c.gkFxAnchor?(c.gkFxAnchor.position.y/1.05||1):Math.max(.6,c.size||1);
        if(c.gkFxAnchor){c.gkFxAnchor.getWorldPosition(_gkMv);gkMeltPuff(k,n,hs,_gkMv.x,_gkMv.y,_gkMv.z,.7)}else gkMeltPuff(k,n,hs,c.x,c.y+(c.jy||0)+hs,c.z,.7)}}
  }else if(c.gkMeltOn)gkMeltRestore(c);
  S.px=c.x;S.py=yy;S.pz=c.z;
}
const GK_CLOTH={fire:[0xa01c14,0xb8301a,0x8c1424],e:[0xb01818,0x901420,0xc02a1c],ice:[0x2f64c0,0x3a78d8,0x2450a0],water:[0x2a5fb8,0x3478d0,0x1f4a9a],d:[0x3a6ad0,0x2a58b0,0x4a82e0],thunder:[0x6a3aa8,0x3a5fd0,0xd0b020],c:[0xd0509f,0x8a40b8,0xb040c0],b:[0x1fa890,0x179a8c,0x28b8a0],a:[0xe8e8f0,0xe0c030,0xf0e8b0],dark:[0x1c1c22,0x141418]};   // 第一属性ごとの服・装飾のメインの色（複数の候補からランダム）: 火・爆破=赤系 / 氷・水・創造=青系 / 雷=紫・青・黄 / 支配=ピンク・紫 / 操作=青緑 / 高エネルギー=白・黄 / 闇=黒系
function gkClothPal(el){const L=GK_CLOTH[el];if(!L)return null;const m=new THREE.Color(L[Math.floor(Math.random()*L.length)]),mk=f=>m.clone().multiplyScalar(f).getHex();
  return{cloth:m.getHex(),C:{robe:mk(.9),sleeve:mk(1),mantle:mk(.8),panel:mk(1.1),sash:mk(.7),hat:mk(.55),armor:new THREE.Color(0x8a8d91).lerp(m,.45).getHex()}}}   // ローブ・袖・肩掛け・えり・飾り帯・帽子・軍人の鎧を、メインの色から作る（金の縁どりと肌はそのまま）
// ---------- ゲートキーパーの「属性の個性」: 色や装飾を変えるだけでは同じキャラに見えるので、第一属性ごとに固有の部品（形と動き）を付ける。部品は属性ごとの候補から1体ごとに抽選（同じ属性でも組み合わせ・大きさ・色味が変わる）。第二属性以降は、体のまわりを回る小さな印（属性ごとに形と色が違う）になる ----------
function gkSigMesh(c,geo,col,x,y,z){   // 本体と同じ材質・頂点色（col=16進 か (Color,x,y,z)で色を決める関数）。被弾・凍結・薄れる表現がそのまま効く
  const q=geo.attributes.position,n=q.count,ca=new Float32Array(n*3),k=new THREE.Color();
  for(let i=0;i<n;i++){if(typeof col==='function')col(k,q.getX(i),q.getY(i),q.getZ(i));else k.set(col);ca[i*3]=k.r;ca[i*3+1]=k.g;ca[i*3+2]=k.b}
  geo.setAttribute('color',new THREE.BufferAttribute(ca,3));
  const m=new THREE.Mesh(geo,c.mat);m.castShadow=true;m.receiveShadow=true;m.position.set(x||0,y||0,z||0);
  const dp=c.gm.dispose;c.gm.dispose=function(){dp.call(c.gm);geo.dispose()};
  return m;
}
function gkSignature(c,G,kd){
  const sold=kd==='soldier',W=MAGE.W*(sold?1.3:1),H=MAGE.H,body=G.body,head=G.head,legs=!!G.legs,ht=G.headTop||.34,R=Math.random,PI=Math.PI,first=c.gkFirst,anim=[],sc=(sold?1.25:1)*(.85+R()*.35);   // sc=部品の大きさ（軍人は体が大きいので1.25倍・1体ごとに±）
  const LM=G.lm,rAt0=LM?LM.waistR:(sold?.3:.3)*W,y0=LM?LM.hemY:(legs?.95*H:.06*H),rh=LM?LM.hemR:(legs?.4:.56)*W,WY=LM?LM.waistY:1.0*H,CY=LM?LM.chestY:1.3*H,CZ=LM?LM.chestZ:(sold?.5:.38)*W,KY1=LM?LM.collarY:1.57*H,KY2=LM?LM.collarY2:1.5*H,KR1=LM?LM.collarR:.38*W+.06,KR2=LM?LM.collarR2:.5*W+.1;   // 体の目印: 裾(足の付け根)の高さと半径 / 腰・胸・襟の高さ(WY・CY・KY) / 胸の前の面(CZ) / 襟の半径。人間ベースの体(G.lm)があればその寸法に合わせる
  const jc=hex=>new THREE.Color(hex).offsetHSL((R()-.5)*.05,0,(R()-.5)*.1).getHex();   // 色味を1体ごとに少しずらす
  const grad=(a,b,h)=>{const ca=new THREE.Color(a),cb=new THREE.Color(b);return(k,x,y)=>{k.copy(ca).lerp(cb,Math.max(0,Math.min(1,y/h)))}};   // 根もと→先端の色
  const mesh=(par,geo,col,x,y,z)=>{const m=gkSigMesh(c,geo,col,x,y,z);par.add(m);return m};
  const omesh=(geo,col)=>gkSigMesh(c,geo,col,0,0,0);
  const spike=(par,r,h,col,x,y,z,rx,ry,rz,seg)=>{const g=new THREE.ConeGeometry(r,h,seg||6);g.translate(0,h/2,0);const m=mesh(par,g,col,x,y,z);m.rotation.set(rx||0,ry||0,rz||0);return m};   // 根もと基準で上へ伸びるとげ
  const orb=new THREE.Group();orb.position.y=WY;body.add(orb);   // 体のまわりを回る飾りの置き場
  const orad=.62*W+.3;
  const orbit=(m,rad,yy,spd,ph,bob)=>{orb.add(m);anim.push(t=>{const a=t*spd+ph;m.position.set(Math.cos(a)*rad,yy+Math.sin(t*1.3+ph*2)*(bob||.05),Math.sin(a)*rad);m.rotation.y=a*2;m.rotation.x=a*.7})};
  const pick=a=>{const s=a.slice().sort(()=>R()-.5);return s.slice(0,Math.max(2,Math.min(a.length,2+Math.floor(R()*(a.length-1)))))};   // 候補から2個以上を抽選
  // 属性ごとの装飾は、高エネルギー（a）の「頭の後ろのリング」だけ残した（ほかの属性の部品・胸の宝石などは無し）
  const HALO=()=>{c.gkSigHead=true;const g=new THREE.Group();g.position.set(0,.05,-.25);head.add(g);mesh(g,new THREE.TorusGeometry(.5,.028,6,8),0xe8c84a,0,0,0);for(let i=0;i<12;i++){const a=i/12*PI*2;spike(g,.035,i%2?.14:.24,0xffe45a,Math.cos(a)*.5,Math.sin(a)*.5,0,0,0,a-PI/2,5)}anim.push(t=>{g.rotation.z=t*.4})};   // 後光（頭の後ろでゆっくり回る輪と放射）
  const has=k=>(c.gkAttributes||[first]).includes(k);   // 第一属性だけでなく、第二属性以降にも装飾が付く（色は第一属性の服の色が基準）
  if(has('a'))HALO();
  const CROWN=()=>{   // 支配（c）の王冠: 頭の上。どの頭の形（ラッパ・輪・円錐・菱形）でも被らないよう、いちばん幅の広い頭より大きく作る（G.hk=頭の大きさの倍率）。色は服のメインか差し色（同じ属性の候補の別の色）
    const hk=G.hk||1,r=.36*hk,hb=.13*hk,hs=.13*hk,n=8,main=c.gkCloth||0xd0509f,ac=(GK_CLOTH[first]||GK_CLOTH.c||[]).filter(x=>x!==main),col=R()<.5||!ac.length?main:ac[Math.floor(R()*ac.length)],cc=new THREE.Color(col),cb=cc.clone().multiplyScalar(1.0).getHex(),cl=cc.clone().lerp(new THREE.Color(0xffffff),.35).getHex();
    const g=new THREE.Group();g.position.y=ht+.03*hk;head.add(g);
    const bd=new THREE.CylinderGeometry(r,r*.92,hb,n*2,1,true);bd.translate(0,hb/2,0);mesh(g,bd,cb,0,0,0);   // 冠の帯
    for(const yy of[0,hb]){const tg=new THREE.TorusGeometry(r*(yy?1:.92),.016*hk,5,n*2);tg.rotateX(PI/2);mesh(g,tg,cl,0,yy,0)}   // 上下のふち
    for(let i=0;i<n;i++){const a2=i/n*PI*2,hh=hs*(i%2?.7:1.1),x=Math.cos(a2)*r*.97,z=Math.sin(a2)*r*.97;spike(g,r*.2,hh,cb,x,hb,z,0,0,0,4);mesh(g,new THREE.SphereGeometry(.026*hk,6,4),cl,x,hb+hh+.01*hk,z)}   // 先のとがった飾り（先に小さな珠）
  };
  if(has('c')&&R()<GKDECO.CROWN_P)CROWN();
  const SASH=()=>{   // 爆破（e）の斜めの帯: 片方の肩から反対側の腰へ、胴をぐるっと一周する。胴まわりの寸法は、体のメッシュから高さごとに測る（服・鎧の厚みにも合う）。色は 暖色の服=赤 / それ以外=黒
    body.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(body.matrixWorld).invert(),v=new THREE.Vector3(),skip=new Set([head,orb,G.shd,G.swH,G.swH2,G.swH3,G.swH4,...(G.arms||[]),...(G.legs||[]),...(G.fists||[])].filter(Boolean));
    const inSkip=o=>{for(let q=o;q&&q!==body;q=q.parent)if(skip.has(q))return true;return false};
    const yA=WY-.05,yB=KY2+.05,NB=14,ex=[];for(let i=0;i<NB;i++)ex.push({x0:1e9,x1:-1e9,zf:-1e9,zb:1e9});
    body.traverse(o=>{if(!o.isMesh||inSkip(o)||!o.geometry||!o.geometry.attributes.position)return;const pa=o.geometry.attributes.position;
      for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);const b=Math.floor((v.y-yA)/(yB-yA)*NB);if(b<0||b>=NB)continue;const e=ex[b];if(v.x<e.x0)e.x0=v.x;if(v.x>e.x1)e.x1=v.x;if(v.z>e.zf)e.zf=v.z;if(v.z<e.zb)e.zb=v.z}});
    const fb={x0:-W*.35,x1:W*.35,zf:CZ,zb:-CZ*.6};for(let i=0;i<NB;i++)if(ex[i].x1<ex[i].x0)Object.assign(ex[i],fb);   // 測れなかった高さは目印の寸法で補う
    const at=y=>ex[Math.max(0,Math.min(NB-1,Math.floor((y-yA)/(yB-yA)*NB)))];
    const sg=R()<.5?1:-1,yc=(WY+KY2)/2,hw=(at(yc).x1-at(yc).x0)/2,ks=(KY2-WY)*.7/Math.max(.2,hw*2),wd=Math.max(.08,hw*.42);
    const P=(th,ee,dy)=>{let x=0,y=yc+dy,z=0;for(let it=0;it<3;it++){const e=at(y),cx=(e.x0+e.x1)/2,cz=(e.zf+e.zb)/2,rx=(e.x1-e.x0)/2+.025+ee,rz=(e.zf-e.zb)/2+.025+ee;x=cx+rx*Math.sin(th);z=cz+rz*Math.cos(th);y=yc+dy+sg*ks*x}return[x,y,z]};   // 帯の中心線: 胴の楕円をぐるっと一周し、高さは横位置に比例して斜めに変わる
    const N=40,ribbon=(dy,w,ee,col)=>{const pos=[];for(let i=0;i<N;i++){const t0=i/N*Math.PI*2,t1=(i+1)/N*Math.PI*2,a=P(t0,ee,dy+w/2),b=P(t0,ee,dy-w/2),c2=P(t1,ee,dy+w/2),d=P(t1,ee,dy-w/2);pos.push(...a,...b,...c2,...c2,...b,...d)}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return mesh(body,g,col,0,0,0)};
    const hsl={h:0,s:0,l:0};new THREE.Color(c.gkCloth||0xb01818).getHSL(hsl);const warm=hsl.h<=.17||hsl.h>=.92,main=warm?0xd01818:0x141414,edge=warm?0x6a0808:0x3c3c3c;   // 暖色（赤〜橙〜黄）の服なら赤、それ以外は黒
    ribbon(0,wd,0,main);ribbon(wd*.4,wd*.16,.006,edge);ribbon(-wd*.4,wd*.16,.006,edge)};   // 帯本体＋上下のふちどり
  if(has('e'))SASH();
  const SWHALO=()=>{   // 巨大な十字の剣の後輪: 体の背後に、大きな輪（ゆっくり回る）と十字の大剣。色と属性は持っている属性（第一属性以降）からランダムに1つ。攻撃のたびにこの輪から剣が数本飛ぶ（gkHaloVolley）
    const els=c.gkAttributes||[first],el=els[Math.floor(R()*els.length)],col=GKA_COL[el]||0xdde8ff,cc=new THREE.Color(col),cl=cc.clone().lerp(new THREE.Color(0xffffff),.45).getHex(),cd=cc.clone().multiplyScalar(.8).getHex();
    const r=.95*H*sc,g=new THREE.Group();g.position.set(0,(CY+KY1)/2+.1*H,-(CZ+.35*H));body.add(g);
    const rg=new THREE.Group();g.add(rg);   // 輪: 剣を円形に並べる（切っ先を外へ向けた小さな剣16本。輪ごとゆっくり回る）
    {const NS=16,bl=.3*r,bw=.05*r,bt=.03*r,gk=new THREE.BoxGeometry(.17*r,.03*r,.04*r),bg=new THREE.BoxGeometry(bw,bl,bt),tg=new THREE.ConeGeometry(bw*.71,.1*r,4),hg=new THREE.BoxGeometry(.03*r,.1*r,.03*r);tg.rotateY(PI/4);
     for(let i=0;i<NS;i++){const a=i/NS*PI*2,sw=new THREE.Group();sw.position.set(Math.cos(a)*r,Math.sin(a)*r,0);sw.rotation.z=a-PI/2;rg.add(sw);
      mesh(sw,bg,cl,0,0,0);mesh(sw,tg,cl,0,bl/2+.05*r,0);mesh(sw,gk,col,0,-bl/2,0);mesh(sw,hg,cd,0,-bl/2-.065*r,0)}}   // 刃・切っ先・鍔・柄（形は共有）
    mesh(g,new THREE.BoxGeometry(.14*r,1.2*r,.05*r),cl,0,.5*r,0);   // 大剣の刃
    const tp=new THREE.ConeGeometry(.1*r,.3*r,4);tp.rotateY(PI/4);mesh(g,tp,cl,0,1.25*r,0);   // 切っ先
    mesh(g,new THREE.BoxGeometry(.9*r,.1*r,.08*r),col,0,-.12*r,0);   // 鍔（十字の横棒）
    mesh(g,new THREE.BoxGeometry(.08*r,.5*r,.06*r),cd,0,-.43*r,0);   // 柄
    mesh(g,new THREE.SphereGeometry(.07*r,8,6),col,0,-.72*r,0);   // 柄頭
    anim.push(t=>{rg.rotation.z=t*.25;g.position.y+=Math.sin(t*1.2)*.0008});
    c.gkSwHalo={g,el,r};
  };
  if(R()<GKDECO.SWHALO_P)SWHALO();   // 背後の装飾は、剣の後輪か背後霊のどちらか（両方は付かない）
  c.gkAnim=anim;
}
function gkPickHeadShape(){const P=GKA.HEAD_P,r=Math.random();let a=0;for(const k in P){a+=P[k];if(r<a)return k}return'diamond'}   // キーパーの頭の形の抽選（残りは菱形）
// ---------- ゲートキーパーの作り方（段階方式）: ① 体型 → ② 腕の数 → ③ 攻撃方法 → ④ 装飾 の順に1つずつ決めて、結果(spec)を spawnMage に渡す ----------
// ① 体型 = 普通(robe・今の体型) / 細長い(lanky) / 太い(bulky) の3タイプ（＋頭の形）。 ② 腕の数 = 2本 か 4本。 ③ 攻撃方法 = 素手型 / 杖型 / 片手剣型（装備と1対1: 剣型だけが剣を持ち、杖型だけが杖を持つ。素手型は何も持たない）。 ④ 装飾 = gkSignature（属性ごとの固有の部品。spawnMage で付ける）。
// 前の段階の結果で、後の段階の選択肢が変わる（例: 剣を使う攻撃＝前宙・闇の乱舞は剣型だけ）。forced=タイプを指定する時だけ渡す。
// ※ 服・マント・肩掛け・帯・襟・頭の飾りは廃止: ゲートキーパーは人間ベースの体（makeGkHuman）のままで、服は付けない。属性の見た目は 体の色づけ（属性の色へ寄せる）と gkSignature で表す。
function gkRollSpec(forced){
  const sp={},R=Math.random;
  // ① 体型（頭以外）: 普通(robe)=今の体型 / 細長い(lanky)=手足が長く、やや前屈みでやや膝を曲げる / 太い(bulky)=上半身が太く、くびれと脚があり、膝を曲げて前屈み。頭の形は別に抽選
  {const P=GKA.FRAME_P,r=R();sp.frame=r<P.lanky?'lanky':r<P.lanky+P.bulky?'bulky':'robe'}
  sp.head=gkPickHeadShape();
  sp.robed=false;sp.armor=R()<GKA.ARMOR_P;sp.bulge=sp.armor&&R()<GKA.BULGE_P;sp.gold=sp.armor&&R()<GKA.GOLD_P;sp.pat=sp.armor&&R()<GKA.PAT_P?['ribs','chevron','studs'][Math.floor(R()*3)]:false;sp.helm=sp.armor&&R()<GKA.HELM_P?gkRollHelm(R):false;if(sp.armor){}else if((sp.frame==='lanky'||sp.frame==='robe')&&R()<GKA.ROBE_P)sp.robed=R()<GKROBE.WIDE_P?'wide':'coat';else sp.robed='suit';   // 全身鎧(armor)は全ての体格で、確率 GKA.ARMOR_P。鎧の時はローブ・上着にならない
     // 服の抽選: ローブ(細い・普通だけ) か 別の服=立ちえりの上着＋ズボン(全ての体格)   // 体が細い(lanky)か普通(robe)の時、確率でローブ姿（太い bulky は着ない）
  // ② 腕の数: 2本 か 4本（確率は GKA.ARMS4_P）。腕なしは廃止
  sp.arms=forced?(forced==='inspector'?4:2):(R()<GKA.ARMS4_P?4:2);
  sp.armless=false;
  // ③ 攻撃方法: 素手型 / 杖型 / 片手剣型 のどれか（腕が2本でも4本でも同じ）。属性の抽選もここ。
  //    属性: 第二属性は必ずつく。第三属性からは後ろの属性ほど低確率。第一属性=第二属性以降で一番多い属性（同数ならランダム）
  {const pool=MAGIC.all,ch=[1,.65,.50,.40,.30,.22,.15,.10,.05];sp.extra=[];
    for(let i=0;i<ch.length;i++){if(R()<ch[i])sp.extra.push(pool[Math.floor(R()*pool.length)]);else break}
    if(sp.extra.length){const cnt={};for(const a of sp.extra)cnt[a]=(cnt[a]||0)+1;const mx=Math.max(...Object.values(cnt)),top=Object.keys(cnt).filter(k=>cnt[k]===mx);sp.first=top[Math.floor(R()*top.length)]}
    else sp.first=pool[Math.floor(R()*pool.length)]}
  {const ST=GKA.STYLE,skip=k=>(k==='quad'&&sp.arms!==4)||(k==='dual'&&sp.arms===4);let tot=0;for(const k in ST)if(!skip(k))tot+=ST[k].p;let r=R()*tot;sp.style='bare';for(const k in ST){if(skip(k))continue;if(r<ST[k].p){sp.style=k;break}r-=ST[k].p}   // 四刀流は腕が4本の時だけ。双剣は腕が2本の時だけ（4本の時は双剣のかわりに四刀流）
       // 攻撃方法を抽選: 素手 / 杖 / 片手剣
    if(forced==='soldier')sp.style='sword';else if(forced==='inspector')sp.style='bare';else if(forced==='mage'&&(sp.style==='sword'||sp.style==='spear'||sp.style==='axe'||sp.style==='great'||sp.style==='dual'||sp.style==='quad'))sp.style='bare'}
  sp.kd=(sp.style==='sword'||sp.style==='spear'||sp.style==='axe'||sp.style==='great'||sp.style==='dual'||sp.style==='quad')?'soldier':sp.style==='staff'?'mage':(sp.arms===4?'inspector':'mage');sp.swP=sp.style==='sword'?gkPickSwP():null;   // 内部の型: 剣=軍人型 / 杖=魔法人型 / 素手=魔法人型（4本腕は調査員型）
  // ④ 装飾: 帽子の有無（makeMage の体に切り替わった時だけ使う）。属性ごとの固有の部品は spawnMage で gkSignature が付ける
  sp.hatless=sp.kd==='inspector'&&(sp.head!=='diamond'||R()<GKA.HATLESS_P);
  sp.armorCol=sp.armor?gkArmorColor(sp.first,R):0;
  sp.deco=sp.robed?gkRollDeco(R):null;   // 服（ローブ・上着）の模様・縁取り（付かないこともある）   // 鎧の色（鎧の時だけ。ランダム）
  return sp;
}
// ---------- ゲートキーパーの体: 人間ベース(HUMAN_B64)の低ポリ人形（服・装飾なし） ----------
// 人間ベースの面を「頭・胴・両腕・両脚（太もも・すね・足）」に分けて取り出し、makeMage と同じ口（arms・legs・head・fists・swH など）をもつ体に組み直す。
//  ・骨のウェイトが粗い（ひざの骨に頂点がない・足首の骨がすねまで担当）ので、骨ではなく面の位置で分ける。ひざと足首は面を水平に切って、関節の球でつなぐ。
//  ・腕と脚はまっすぐ下へ伸ばした形で取り出す（腕の開き・歩く時の脚の振りは mageStep が付ける）。
//  ・頭だけは従来の異形（菱形・ラッパ・円錐・輪）のまま、首の少し上に浮かべる。
//  ・色は、肌の色を第一属性の色へ TINT の割合でそめる（頭と手は肌のまま。服・マント・装飾は付けない）。
const GKH={S:2,TINT:.6,   // S=人間ベース（高さ2）を何倍にするか（g.scale=hs でさらに拡大される。2なら高さ約4）/ TINT=体を第一属性の色にそめる割合（0=肌のまま / 1=属性の色）
  FRAME:{   // 体格ごとの倍率: leg=脚の長さ / arm=腕の長さ / thick=手足の太さ / wx・wz=胴の横幅・前後の厚み / tor=胴の縦 / head=頭の大きさ / lx=左右の脚の間隔（robe=ふつうの体型）
    robe:{leg:1,arm:1,thick:1.1,wx:1,wz:1.15,tor:1,head:1,lx:1},
    lanky:{leg:1.5,arm:1.45,thick:.85,wx:.85,wz:.95,tor:1.1,head:.9,lx:.9},
    bulky:{leg:1.05,arm:1.2,thick:1.4,wx:1.5,wz:1.4,tor:1,head:.85,lx:1.35}},
  GAIT:{    // 歩き方（mageStep の G.gait。意味は makeMage の GT と同じ）
    robe:{sw:.45,kn:.7,out:.03,toe:0,cad:.75,bob:.04,roll:.04,arm:.28,lx:1,lag:.6,twist:.08,nod:.02},
    lanky:{sw:.42,kn:.75,out:.02,toe:0,cad:.6,bob:.03,roll:.05,arm:.26,lx:1,lag:.7,twist:.1,nod:.02},
    bulky:{sw:.5,kn:.55,out:.2,toe:.05,cad:.8,bob:.07,roll:.14,arm:.4,lx:1,kz:1,lag:.5,twist:.16,nod:.06}}};
let gkHumanCache=null;
function gkClipY(list,c){   // 三角形の一覧を、高さ c の水平な面で切る → [上側, 下側]
  const up=[],dn=[];
  for(const t of list){const v=[[t[0],t[1],t[2]],[t[3],t[4],t[5]],[t[6],t[7],t[8]]];
    for(const[keep,dst]of[[y=>y>=c,up],[y=>y<c,dn]]){const o=[];
      for(let i=0;i<3;i++){const p=v[i],q=v[(i+1)%3],ps=keep(p[1]),qs=keep(q[1]);if(ps)o.push(p);if(ps!==qs){const u=(c-p[1])/(q[1]-p[1]);o.push([p[0]+(q[0]-p[0])*u,c,p[2]+(q[2]-p[2])*u])}}
      for(let i=1;i+1<o.length;i++)dst.push([o[0][0],o[0][1],o[0][2],o[i][0],o[i][1],o[i][2],o[i+1][0],o[i+1][1],o[i+1][2]])}}
  return[up,dn]}
function gkAlign(a,b){   // 点 a→b の向きが真下(0,-1,0)になるよう、ベクトルを回す関数を返す（Rodriguesの回転）
  const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],l=Math.hypot(d[0],d[1],d[2])||1;d[0]/=l;d[1]/=l;d[2]/=l;
  const s=Math.hypot(d[0],d[2]);if(s<1e-9)return v=>v;
  const kx=d[2]/s,kz=-d[0]/s,c=-d[1];
  return v=>{const dt=kx*v[0]+kz*v[2];return[v[0]*c-kz*v[1]*s+kx*dt*(1-c),v[1]*c+(kz*v[0]-kx*v[2])*s,v[2]*c+kx*v[1]*s+kz*dt*(1-c)]}}
function gkHumanGeo(tris,f){   // 三角形の一覧 → 面ごとに頂点をもつ形（f=頂点(x,y,z)の変換）。面ごとの法線＝角ばった陰影
  const pos=new Float32Array(tris.length*9);let o=0;
  for(const t of tris)for(let k=0;k<3;k++){const q=f(t[k*3],t[k*3+1],t[k*3+2]);pos[o++]=q[0];pos[o++]=q[1];pos[o++]=q[2]}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.computeVertexNormals();return g}
function gkZAt(tris,x,y){   // 面の上の点(x,y)で、いちばん前（+Z）にある面の高さz（頭の表面に目を置くため）。なければ -1e9
  let best=-1e9;
  for(const t of tris){const ax=t[0],ay=t[1],az=t[2],bx=t[3],by=t[4],bz=t[5],cx=t[6],cy=t[7],cz=t[8],d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-9)continue;
    const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,w=1-u-v;
    if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)best=Math.max(best,u*az+v*bz+w*cz)}
  return best}
function gkHumanParts(){   // 人間ベースを部位ごとの三角形に分けて取り出す（1回だけ）。取り出せなかった時は false
  if(gkHumanCache!==null)return gkHumanCache;
  gkHumanCache=false;
  try{
    const bin=atob(window.HUMAN_B64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
    const{geo,skin}=parseGLB(u8.buffer),P=geo.attributes.position,ix=geo.index.array,nV=P.count,nm=skin.names.map(s=>s.split(':').pop());
    const J=n=>{const j=nm.indexOf(n);if(j<0)throw new Error('骨がない: '+n);return skin.pos[j]};
    const dom=new Array(nV);   // 頂点ごとに、いちばんウェイトの大きい骨
    for(let v=0;v<nV;v++){const acc={};let best=0,bw=-1;for(let k=0;k<4;k++){const j=skin.joints[v*4+k];acc[j]=(acc[j]||0)+skin.weights[v*4+k]}for(const j in acc)if(acc[j]>bw){bw=acc[j];best=+j}dom[v]=nm[best]}
    const T={head:[],torso:[],armL:[],armR:[],legL:[],legR:[]},hipY=J('LeftUpLeg')[1];let fy=1e9;
    for(let t=0;t<ix.length;t+=3){const a=ix[t],b=ix[t+1],c=ix[t+2],cnt={};for(const v of[a,b,c])cnt[dom[v]]=(cnt[dom[v]]||0)+1;
      const n=Object.keys(cnt).sort((p,q)=>cnt[q]-cnt[p])[0],cx=(P.getX(a)+P.getX(b)+P.getX(c))/3,cy=(P.getY(a)+P.getY(b)+P.getY(c))/3;   // 面の骨=3頂点の多数決
      const mnx=Math.min(Math.abs(P.getX(a)),Math.abs(P.getX(b)),Math.abs(P.getX(c)));   // 腕の骨の面でも、体の中心に近い面（胸の脇を縦に走る細長い面。腕を上げると破片になる）は胴にもどす
      const k=n==='Head'?'head':/^Left(Arm|ForeArm|Hand)$/.test(n)?(mnx<.165?'torso':'armL'):/^Right(Arm|ForeArm|Hand)$/.test(n)?(mnx<.165?'torso':'armR'):(/(Leg|Foot|ToeBase)$/.test(n)||(n==='Hips'&&cy<hipY))?(cx>0?'legL':'legR'):'torso';   // 腰の骨の面のうち、股関節より下は脚
      T[k].push([P.getX(a),P.getY(a),P.getZ(a),P.getX(b),P.getY(b),P.getZ(b),P.getX(c),P.getY(c),P.getZ(c)]);
      fy=Math.min(fy,P.getY(a),P.getY(b),P.getY(c))}
    const leg={},arm={};
    for(const sd of['L','R']){const S0=sd==='L'?'Left':'Right',hp=J(S0+'UpLeg'),kn=J(S0+'Leg'),ak=J(S0+'Foot'),[th,rest]=gkClipY(T['leg'+sd],kn[1]),[sh,ft]=gkClipY(rest,ak[1]);   // 太もも / すね / 足（ひざ・足首の高さで水平に切る）
      leg[sd]={th,sh,ft,hp,kn,ak};arm[sd]={t:T['arm'+sd],S:J(S0+'Arm'),W:J(S0+'Hand'),E:(()=>{try{return J(S0+'ForeArm')}catch(e){return null}})()}}
    const hb={x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z0:1e9,z1:-1e9};   // 頭の大きさ
    for(const t of T.head)for(let k=0;k<3;k++){hb.x0=Math.min(hb.x0,t[k*3]);hb.x1=Math.max(hb.x1,t[k*3]);hb.y0=Math.min(hb.y0,t[k*3+1]);hb.y1=Math.max(hb.y1,t[k*3+1]);hb.z0=Math.min(hb.z0,t[k*3+2]);hb.z1=Math.max(hb.z1,t[k*3+2])}
    let cz=-1e9;for(const t of T.torso)for(let k=0;k<3;k++)if(t[k*3+1]>.2&&t[k*3+1]<.5)cz=Math.max(cz,t[k*3+2]);   // 胸の前の面の高さ（胸に付ける飾りの位置）
    let nt=-1e9;for(const t of T.torso)for(let k=0;k<3;k++)nt=Math.max(nt,t[k*3+1]);   // 首の上端の高さ（頭はこの少し上に浮かぶ）
    const hl=J('LeftUpLeg'),hr=J('RightUpLeg');
    gkHumanCache={neckTop:nt,torso:T.torso,head:T.head,headBox:hb,leg,arm,hip:[(hl[0]+hr[0])/2,(hl[1]+hr[1])/2,(hl[2]+hr[2])/2],floor:fy,chestZ:cz};
  }catch(e){console.warn('ゲートキーパーの体を人間ベースから取り出せませんでした',e);gkHumanCache=false}
  return gkHumanCache}
const GKROBE={HEM:.28,PAD:.09,FLARE:1.35,SW:.26,KN:.45,WIDE_P:.5,WIDE:{HEM:.1,PAD:.11,FLARE:1.9,SW:.18,KN:.35}};   // WIDE_P=ローブになった時に「ゆったり型」になる確率 / WIDE=ゆったり型の値（すそが地面近くまで広がる）   // ローブ: HEM=すその高さ(脚の長さに対する割合) / PAD=体からの膨らみ(m) / FLARE=すその広がり(腰まわりの倍率) / SW・KN=ローブ時の脚の振り・ひざの曲げ
const GKGRIP={X:0,Y:0,Z:0};   // 杖・剣の握り位置の微調整(m・腕の座標。手の中心からのずれ): X=横 / Y=上下(−で指先寄り) / Z=前後(＋で手のひら側・−で手の甲側)
const GKHELM={SC:1.5,BY:{robe:1.1}};   // フルフェイスの兜（実質的に別の頭）の大きさの倍率（1=初期の大きさ）。頭の形の標準の大きさ（F.head）にさらに掛かる
function gkRollHelm(R){   // 兜の「素体」と「追加パーツ」をランダムに組み合わせる。素体=round(丸い顔板) / wedge(角ばった平らな顔板が前下へとがる) / tall(縦長で丸みのある顔板)。追加パーツ=spike(円盤つきの円錐) / arch(頭の上を前後へ通る帯) / crest(とさか) / horns(角)を 0〜2個。穴・耳・首まわり・顔板の幅・びょうの間隔もランダム
  const pick=a=>a[Math.floor(R()*a.length)],r=R(),body=r<.4?'round':r<.7?'wedge':'tall',sz=.92+R()*.18,dm=({round:[.19,.26,.23],wedge:[.19,.26,.22],tall:[.17,.30,.22]})[body].map(v=>v*sz);
  const pool=['spike','arch','crest','horns'],n=R()<.2?0:R()<.625?1:2,parts=[];   // 追加パーツの数: 0個20% / 1個50% / 2個30%（spike と crest は同時に付けない）
  while(parts.length<n&&pool.length){const q=pool.splice(Math.floor(R()*pool.length),1)[0];if((q==='crest'&&parts.includes('spike'))||(q==='spike'&&parts.includes('crest')))continue;parts.push(q)}
  return{body,dm,parts,holes:pick(['band','band+mouth','full']),ear:pick(['box','oval']),neck:pick(['collar','skirt']),cw:.35+R()*.2,rv:pick([10,12,15]),pk:.9+R()*.2,rail:R()<.5}}   // holes=穴をあける範囲 / cw=顔板の中央の幅 / rv=びょうの間隔 / pk=顔板の前への出っぱり具合 / rail=アーチが2本線か
function gkRollHolyHelm(R){   // 高エネルギーの鎧専用の兜: 前下へ長くとがる顔板（wedge）＋後ろに大きな扇形のアーチ（fan: 外の帯と内の帯を、放射状の骨と横の支えでつなぐ）。穴は帯状・首まわりは首当て
  const sz=.95+R()*.1;return{body:'wedge',dm:[.19*sz,.26*sz,.22*sz],parts:['fan'],holes:'band',ear:R()<.5?'box':'oval',neck:'collar',cw:.38+R()*.1,rv:R()<.5?12:15,pk:1.8,rail:false,halo:true}}
const GKDECO={PAT_P:.55,TRIM_P:.65,DBL_P:.35,HAT_P:.4,CROWN_P:.6,SWHALO_P:.25};   // HAT_P=頭の装飾（ツバの長い魔女風の帽子 / シルクハット / 円錐のマスク のどれか1つ。色は服と同じ）が付く確率
//   // 服（ローブ・上着）の模様と縁取り: PAT_P=模様が付く確率 / TRIM_P=縁取りが付く確率（どちらも付かない服もある） / DBL_P=縁取りが二重線になる確率。全身鎧は別（pat・gold）
function gkRollDeco(R){   // 服ごとの模様・縁取りを抽選: pat=模様の種類（縦縞・細い縦縞・横縞・市松・水玉・菱形・山形・格子）/ pcol・tcol=模様・縁取りの色（明るい・暗い・金・反対色。服の色から作る）/ trim=縁取りを付ける場所（すそ・袖口・前・えり から1〜3か所）
  const pick=a=>a[Math.floor(R()*a.length)],kinds=['light','dark','gold','contrast'],d={pat:null,pcol:null,sp:pick([3,4,6]),jo:Math.floor(R()*8),trim:null,tcol:null,tw:.8+R()*.7,dbl:false,hat:null};
  if(R()<GKDECO.PAT_P){d.pat=pick(['vstripe','pin','hstripe','check','dots','diamond','chevron','plaid']);d.pcol=pick(kinds)}
  if(R()<GKDECO.TRIM_P){const all=['hem','cuff','front','collar'],n=1+Math.floor(R()*3);d.trim=[];while(d.trim.length<n)d.trim.push(all.splice(Math.floor(R()*all.length),1)[0]);d.tcol=pick(kinds.filter(k=>k!==d.pcol));d.dbl=R()<GKDECO.DBL_P}
  if(R()<GKDECO.HAT_P)d.hat=pick(['witch','top','mask']);
  return d}
function makeGkHuman(hs,variant,frame,headShape,arms4,robed,armor,weapon,shield,bulge,gold,pat,acol,deco,helm){   // ゲートキーパーの3Dモデル（足もとが原点・正面+Z）。makeMage と同じ戻り値。取り出せなかった時は null（呼び出し側が makeMage に切り替える）
  const H=gkHumanParts();if(!H)return null;
  const RK=robed==='wide'?Object.assign({},GKROBE,GKROBE.WIDE):GKROBE;   // ローブの種類: 'coat'=調査員風のコート / 'wide'=ゆったりしたローブ（広がるすそ・ベル型の袖・縁どり）
  const insp=variant==='inspector',sold=variant==='soldier',F=GKH.FRAME[frame]||GKH.FRAME.robe,S=GKH.S,
    C=Object.assign({},MAGE.COL,insp?MINSP.COL:sold?MSOLD.COL:null,robed?{sash:MINSP.COL.sash,trim:MINSP.COL.trim,mantle:MINSP.COL.mantle}:null),geos=[],parts=[],legArr=[],arms=[],fists=[];
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide,flatShading:true});mageLookMat(mat);   // 面ごとの陰影＋つやなし＋粗い粒（mageLookMat）。被弾の赤い点滅・薄れは mat の色と透明度で全体にかかる
  const mix=(a,b)=>new THREE.Color(a).lerp(new THREE.Color(b),GKH.TINT);let PL;
  const pal=()=>{PL={body:mix(C.skin,C.robe),arm:robed?new THREE.Color(C.sleeve):mix(C.skin,C.sleeve),skin:new THREE.Color(C.skin),head:new THREE.Color(C.head)}};pal();   // 体=肌を属性の色へ寄せた色 / 頭・手=肌
  const fill=(geo,fn)=>{const p=geo.attributes.position,ca=geo.attributes.color,k=new THREE.Color();for(let i=0;i<p.count;i++){fn(k,p.getX(i),p.getY(i),p.getZ(i));ca.setXYZ(i,k.r,k.g,k.b)}ca.needsUpdate=true};
  const add=(parent,geo,fn,x,y,z)=>{geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*3),3));fill(geo,fn);geos.push(geo);parts.push({geo,fn});
    const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
  const recolor=over=>{Object.assign(C,over);pal();for(const pr of parts)fill(pr.geo,pr.fn)};   // 第一属性の色に塗り直す（gkClothPal の結果を受け取る）
  const ringOf=geo=>{const p=geo.attributes.position;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,n=0;for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<1e-4){n++;x0=Math.min(x0,p.getX(i));x1=Math.max(x1,p.getX(i));z0=Math.min(z0,p.getZ(i));z1=Math.max(z1,p.getZ(i))}return n?{cx:(x0+x1)/2,cz:(z0+z1)/2,rx:(x1-x0)/2,rz:(z1-z0)/2}:null};   // 切り口(y=0)の中心と半径
  const cap=(parent,r)=>{if(!r)return;const g=new THREE.SphereGeometry(1,6,4);g.scale(r.rx*1.1,Math.min(r.rx,r.rz)*.95,r.rz*1.1);add(parent,g,k=>k.copy(PL.body),r.cx,0,r.cz)};   // 関節の球（曲げた時の切れ目を隠す）
  const lenOf=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),hy0=H.hip[1],hz=H.hip[2],Lg=H.leg.L;
  const legUp=lenOf(Lg.hp,Lg.kn)*F.leg*S,legLo=lenOf(Lg.kn,Lg.ak)*F.leg*S,soleH=(Lg.ak[1]-H.floor)*S,hipH=legUp+legLo+soleH;   // 太ももの長さ・すねの長さ・足首から足の裏・地面から股関節まで（脚はまっすぐ伸ばした長さ）
  const g=new THREE.Group(),body=new THREE.Group();body.position.y=.02;g.add(body);g.scale.setScalar(hs);
  // 胴
  add(body,gkHumanGeo(H.torso,(x,y,z)=>[x*F.wx*S,hipH+(y-hy0)*F.tor*S,(z-hz)*F.wz*S]),k=>k.copy(PL.body),0,0,0);
  // ローブ（体が細い lanky だけ・確率）: 調査員のトレンチコート風（長い外衣・帯・ボタン・立ちえり）を体の上にかぶせる。体は作り直さず、脚の振りを小さくするだけ
  // ===== 服の模様・縁取り（deco）: 模様=土台の服の少し外側に、色のついたマスだけを重ねる（土台と同じ多角形に沿うので浮かない） / 縁取り=すそ・袖口・えり・前のあわせの帯。色は服の色から作る（属性の色への塗り直し recolor にも追従） =====
  const DC=deco||{},_dw=new THREE.Color(0xf2eee2),_dh={h:0,s:0,l:0};
  const dcf=(kind,m)=>(k,x,y,z)=>{k.set(C.robe);const l=k.r*.3+k.g*.59+k.b*.11;let q=kind;   // 服の色が明るければ「明るい」は暗く、暗ければ「暗い」は明るく入れ替えて、必ず見える色にする
    if(q==='light'&&l>.6)q='dark';else if(q==='dark'&&l<.14)q='light';
    if(q==='gold')k.set(0xcfa83c);else if(q==='light')k.lerp(_dw,.6);else if(q==='dark')k.multiplyScalar(.38);
    else{k.getHSL(_dh);k.setHSL((_dh.h+.5)%1,Math.max(.4,_dh.s),_dh.l>.5?_dh.l*.42:Math.min(.82,_dh.l+.4))}
    k.multiplyScalar((m||1)*(.93+.07*Math.sin(x*47+y*31+z*23)))};
  const dsurf=(rings,N)=>{const sg=2*Math.PI/N;   // rings=上→下の断面 [{y,rx,zr,cz}] / N=土台のレースの辺の数。高さ y・角度 ph（正面=+Z が 0）の表面の点を、土台の多角形の面に沿って返す（off=外へのずらし）
    return(y,ph,off)=>{let a=rings[0],b=rings[0],f=0;
      for(let i=0;i<rings.length-1;i++)if(y<=rings[i].y+1e-6&&y>=rings[i+1].y-1e-6){a=rings[i];b=rings[i+1];f=a.y===b.y?0:(a.y-y)/(a.y-b.y);break}
      const rx=a.rx+(b.rx-a.rx)*f,zr=a.zr+(b.zr-a.zr)*f,cz=a.cz+(b.cz-a.cz)*f,kk=Math.floor(ph/sg),lo=ph-(kk+.5)*sg,sc=Math.cos(sg/2)/Math.cos(lo),sn=Math.sin(ph),cs=Math.cos(ph);
      return[(rx*sc+off)*sn,y,cz+(zr*sc+off)*cs]}};
  const dshell=(parent,rings,N,NS,yT,yB,rowH,mask,col,off)=>{   // 高さ yT→yB を行、横を NS 個のマスに分け、mask(正面からの距離u,行j)が真のマスだけ面にして重ねる（rowH が大きければ1行の帯）
    const NY=Math.max(1,Math.round((yT-yB)/rowH)),sf=dsurf(rings,N),pos=[],Pt=(i,j)=>sf(yT-(yT-yB)*j/NY,2*Math.PI*i/NS,off);
    for(let j=0;j<NY;j++)for(let i=0;i<NS;i++){if(!mask(Math.min(i,NS-1-i),j))continue;const a=Pt(i,j),b=Pt(i+1,j),c=Pt(i,j+1),d=Pt(i+1,j+1);pos.push(...a,...c,...b,...b,...c,...d)}
    if(!pos.length)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return add(parent,g,col,0,0,0)};
  const dmask=pat=>{const sp=DC.sp||4,jo=DC.jo||0,w=Math.max(1,Math.round(sp/3));   // 模様の形（u=正面から左右対称に数えたマスの位置 / j=上からの行）
    switch(pat){
      case'vstripe':return u=>u%sp<w;
      case'pin':return u=>u%3===0;
      case'hstripe':return(u,j)=>(j+jo)%6<2;
      case'check':return(u,j)=>((u>>1)+((j+jo)>>1))&1;
      case'dots':return(u,j)=>(j+jo)%4<2&&(u+(((j+jo)>>2)&1?2:0))%4<2;
      case'diamond':return(u,j)=>Math.abs(u%8-4)+Math.abs((j+jo)%8-4)<=2;
      case'chevron':return(u,j)=>((j+jo+Math.abs(u%12-6))%6)<2;
      case'plaid':return(u,j)=>u%6<1||(j+jo)%8<1}
    return()=>false};
  let RB=null;
  if(robed){
    const wide=robed==='wide',suit=robed==='suit',yy=v=>hipH+(v-hy0)*F.tor*S,K=RK,aS=H.arm.R.S,Lg0=H.leg.L;
    const fit=frame==='lanky'||frame==='robe';   // 普通・細い体型: 肩から上（首〜肩）は体の曲線に沿わせる
    const ext=(yr,bw)=>{bw=bw||.09;let xr=.12,zf=.05,zb=.05;for(const t of H.torso)for(let k=0;k<3;k++)if(Math.abs(t[k*3+1]-yr)<bw){xr=Math.max(xr,Math.abs(t[k*3]));zf=Math.max(zf,t[k*3+2]-hz);zb=Math.max(zb,hz-t[k*3+2])}return{x:xr,zf,zb}};   // 高さ yr 付近の胴の左右・前・後ろのはし
    const legX=Math.abs(Lg0.hp[0])*F.wx*S*F.lx,legR=legX+.11*S*F.thick+K.PAD,legZ=.11*S*F.thick+K.PAD;   // 太ももが外へ出ないように、腰から下は脚の外側まで包む
    const ring=(yr,yb,ex,lo,bw)=>{const e=ext(yr,bw);let r={y:yb,rx:e.x*F.wx*S+ex,zf:e.zf*F.wz*S+ex,zb:e.zb*F.wz*S+ex};if(lo){r.rx=Math.max(r.rx,legR);r.zf=Math.max(r.zf,legZ);r.zb=Math.max(r.zb,legZ)}return r};   // 胴の断面（前後は別々に測る＝胸の出っ張りや背中でもローブが埋まらない）
    const rN0=fit?ring(H.neckTop-.04,yy(H.neckTop),.035,false,.06):ring(H.neckTop-.06,yy(H.neckTop),K.PAD+.02,false);rN0.rx=Math.max(rN0.rx,fit?.12:.14);   // 首のまわり（沿わせる時は細い範囲で測り、余白も小さく）
    const rS0=ring(aS[1]-.03,yy(aS[1])-.03,K.PAD,false);rS0.rx=Math.max(rS0.rx,Math.abs(aS[0])*F.wx*S*.95+.05,rN0.rx+.05);
    let prx=rN0.rx;const up=fit?[.2,.4,.6,.8].map(t=>{const yr=H.neckTop-t*(H.neckTop-aS[1]),r=ring(yr,yy(yr),.035+K.PAD*.7*t,false,.06);r.rx=Math.min(Math.max(r.rx,prx),rS0.rx);prx=r.rx;return r}):[];   // 首から肩までを途中の断面でつなぎ、肩の傾き（僧帽筋のなだらかな坂）に沿わせる
    const yH=Math.max(hipH*K.HEM,soleH+(wide?.12:.2));
    let P;
    if(suit){const hr=ring(-.12,yy(-.12),K.PAD+.05,true);P=[rN0,...up,rS0,ring(.42,yy(.42),K.PAD,false),ring(.20,yy(.20),K.PAD-.03,false),ring(.04,yy(.04),K.PAD+.02,true),{y:hr.y,rx:hr.rx*1.06,zf:hr.zf*1.06,zb:hr.zb*1.06}]}   // 上着: 腰でややしぼり、すそは腰骨のあたりで少し広がる（スケッチ）
    else{P=[rN0,...up,rS0,ring(.42,yy(.42),K.PAD,false),ring(.30,yy(.30),K.PAD,false),ring(.18,yy(.18),K.PAD+(wide?.03:0),false),ring(.04,yy(.04),K.PAD,true),ring(-.1,yy(-.1),K.PAD,true)];
      const lastR=P[P.length-1];P.push({y:yH,rx:lastR.rx*K.FLARE,zf:lastR.zf*K.FLARE*.85,zb:lastR.zb*K.FLARE*.85})}
    P=P.filter((p,i,a)=>i===0||p.y<a[i-1].y-.01);   // 上→下（高さが下がる点だけ）
    const np=P.length,rg=new THREE.LatheGeometry(P.map(p=>new THREE.Vector2(p.rx,p.y)),12),pp=rg.attributes.position;
    for(let i=0;i<pp.count;i++){const p=P[i%np];pp.setZ(i,(p.zf-p.zb)/2+pp.getZ(i)*(p.zf+p.zb)/2/p.rx)}   // 点ごとに前後の厚みと中心位置を胴に合わせる
    const yN=P[0].y,yHm=P[np-1].y,interp=(y,f)=>{for(let i=0;i<np-1;i++)if(y<=P[i].y&&y>=P[i+1].y)return f(P[i])+(f(P[i+1])-f(P[i]))*(P[i].y-y)/(P[i].y-P[i+1].y);return f(P[np-1])};
    add(body,rg,(k,x,y,z)=>{const th=Math.atan2(x,z),yn=Math.max(0,Math.min(1,(y-yHm)/(yN-yHm)));k.set(C.robe).multiplyScalar(.7+.35*yn+.07*Math.sin(th*10)*(1-yn))},0,0,0);   // 長いローブ（ひだ・すそほど暗い）
    const yW=yy(.18),wr=interp(yW,p=>p.rx),wzr=interp(yW,p=>(p.zf+p.zb)/2),wcz=interp(yW,p=>(p.zf-p.zb)/2);
    if(!wide&&!suit){const bt=new THREE.TorusGeometry(wr+.014,.035,5,12);bt.rotateX(Math.PI/2);bt.scale(1,1,(wzr+.014)/(wr+.014));add(body,bt,k=>k.set(C.sash),0,yW,wcz)}   // 帯（コート型だけ）
    if(!wide)for(const v of(suit?[.5,.43,.36,.29,.22,.15,.08,.01]:[.46,.38,.30])){const y=yy(v),bg=new THREE.SphereGeometry(suit?.032:.028,5,3);add(body,bg,k=>k.set(C.trim),0,y,interp(y,p=>p.zf)+.012)}   // 前のボタン（ローブの前の面の上）
    const cg=new THREE.LatheGeometry((wide?[[rN0.rx*1.0,yN-.08],[rN0.rx*1.45,yN+.02],[rN0.rx*1.25,yN+.15]]:suit?[[rN0.rx*1.0,yN-.06],[rN0.rx*1.05,yN+.17]]:[[rN0.rx*.92,yN-.04],[rN0.rx,yN+.03],[rN0.rx*1.3,yN+.2]]).map(p=>new THREE.Vector2(p[0],p[1])),8),cq=cg.attributes.position;
    for(let i=0;i<cq.count;i++)cq.setZ(i,(rN0.zf-rN0.zb)/2+cq.getZ(i)*(rN0.zf+rN0.zb)/2/rN0.rx);add(body,cg,k=>k.set(C.mantle),0,0,0);   // 立ちえり（ゆったり型は低く広がるえり）
    if(wide){const hr=P[np-1],tg=new THREE.TorusGeometry(hr.rx*.98,.04,5,14);tg.rotateX(Math.PI/2);tg.scale(1,1,(hr.zf+hr.zb)/2/(hr.rx*.98));add(body,tg,k=>k.set(C.trim),0,yHm+.05,(hr.zf-hr.zb)/2)}   // すその縁どり（金の帯）
    if(DC.pat||DC.trim){   // 服の模様（胴・すそ）と縁取り（すそ・前のあわせ・えり）
      const rg2=P.map(p=>({y:p.y,rx:p.rx,zr:(p.zf+p.zb)/2,cz:(p.zf-p.zb)/2})),tcf=DC.trim?dcf(DC.tcol,1.05):null;
      if(DC.pat)dshell(body,rg2,12,48,yN-.12,yHm+.01,.045,dmask(DC.pat),dcf(DC.pcol,1),.008);
      if(DC.trim){const T=DC.trim,bw=.07*DC.tw,y0=yHm+.01+(wide?.1:0);
        if(T.includes('hem')){dshell(body,rg2,12,48,y0+bw,y0,1,()=>true,tcf,.016);if(DC.dbl)dshell(body,rg2,12,48,y0+bw+.05+bw*.45,y0+bw+.05,1,()=>true,tcf,.016)}   // すその帯（二重線の時は上にもう1本。ゆったり型は金の帯の上）
        if(T.includes('front'))dshell(body,rg2,12,48,yN-.06,yHm+.01,.045,u=>u<(DC.tw>1.1?2:1),tcf,.016);   // 前のあわせの縦の帯
        if(T.includes('collar')){const rT=rN0.rx*(wide?1.25:suit?1.05:1.3)*.96,yT2=yN+(wide?.15:suit?.17:.2),tg2=new THREE.TorusGeometry(rT,.02,4,12);tg2.rotateX(Math.PI/2);tg2.scale(1,1,(rN0.zf+rN0.zb)/2/rN0.rx);add(body,tg2,tcf,0,yT2,(rN0.zf-rN0.zb)/2)}}}   // えりの上の縁
    RB={yH:yHm,rH:P[np-1].rx,rW:wr,rN:rN0.rx,zC:interp(yy(.38),p=>p.zf)}}
  // ===== 全身鎧（服のタイプの一つ。armor=true の時）: 体は作り替えず、体の上に鋼の板をかぶせる。胴=喉当て・胸当て・腰の帯・草摺（前・横・後ろの板） / 腕=肩当て（2枚重ね）・二の腕・ひじ・前腕・籠手 / 脚=腿・膝当て・すね当て・鉄靴。色は固定（通常=鋼色・爆破=赤。属性の色には寄せない） =====
  const steel=(m)=>(k,x,y,z)=>{k.set(acol||(armor==='blast'?0xa8302a:armor==='holy'?0xe2e6ee:0xa7aeb8)).multiplyScalar((m||1)*(.88+.12*Math.sin(x*41+y*29+z*17)))};   // 鎧の色は番人ごとにランダム（acol。属性の色には寄せない）。明暗は部品ごとの m と、位置による細かいムラだけ
  const stH=steel(1.16,.5),und=(k,x,y,z)=>{k.set(armor==='blast'?0x2a1013:0x353840).multiplyScalar(.85+.15*Math.sin(x*57+y*43+z*29))},brs=(k,x,y,z)=>{(gold?k.set(0xe3b53c):armor==='blast'?k.set(0x2b1011):armor==='holy'?k.set(0xb8bcc6):k.set(acol||0xa7aeb8).multiplyScalar(.6)).multiplyScalar(.9+.1*Math.sin(x*61+y*37+z*23))};   // stH=磨いた明るい鋼（稜線・頂） / und=板の継ぎ目からのぞく暗い鎖かたびら / brs=縁どり・留め具（gold の時だけ金色。無い時は板と同系の暗い色）。鎧が「箱の寄せ集め」に見えないよう、板を重ね・継ぎ目に暗い層・縁に明るい線を入れる
  const flatRing=(par,r,y,tube,fn,sz,cz)=>{const tg=new THREE.TorusGeometry(r,tube,4,8);tg.rotateX(Math.PI/2);tg.scale(1,1,sz||1);add(par,tg,fn,0,y,cz||0)};
  const pcol=(k,x,y,z)=>{(armor==='blast'?k.set(0x2a0d0e):armor==='holy'?k.set(0xc9a02a):k.set(acol||0xa7aeb8).multiplyScalar(.5)).multiplyScalar(.9+.1*Math.sin(x*53+y*41+z*27))};   // 表面の模様の色（通常=板の色を暗くした色 / 爆破=黒に近い赤 / 高エネ=金）
  const rod=(par,A,B,w,fn)=>{const d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],l=Math.hypot(d[0],d[1],d[2])||1,u=d.map(v=>v/l),ref=Math.abs(u[2])<.9?[0,0,1]:[1,0,0],cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],nz=v=>{const m=Math.hypot(v[0],v[1],v[2])||1;return v.map(c=>c/m)},n1=nz(cr(u,ref)),n2=nz(cr(u,n1)),mid=[(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2],R=[[1,n1,w],[1,n2,w*.7],[-1,n1,w],[-1,n2,w*.7]].map(([sg,n,ww])=>[mid[0]+sg*n[0]*ww,mid[1]+sg*n[1]*ww,mid[2]+sg*n[2]*ww]),ps=[];for(const T of[A,B])for(let i=0;i<4;i++)ps.push(...T,...R[i],...R[(i+1)%4]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(ps),3));g.computeVertexNormals();add(par,g,fn,0,0,0)};   // A〜B をつなぐ細い両端のとがった棒（模様の線）   // 縁どりの輪（横に寝かせる。sz=前後の潰し率・cz=前後の中心）
  if(armor){
    const yA=v=>hipH+(v-hy0)*F.tor*S,aS=H.arm.R.S,st=steel(1),stD=steel(.7);
    const exA=(yr,bw)=>{let xr=.12,zf=.05,zb=.05;for(const t of H.torso)for(let k=0;k<3;k++)if(Math.abs(t[k*3+1]-yr)<bw){xr=Math.max(xr,Math.abs(t[k*3]));zf=Math.max(zf,t[k*3+2]-hz);zb=Math.max(zb,hz-t[k*3+2])}return{x:xr,zf,zb}};
    const OC=1/Math.cos(Math.PI/8),rA=(yr,pad)=>{const e=exA(yr,.06);return{y:yA(yr),rx:(e.x*F.wx*S+pad)*OC,zf:(e.zf*F.wz*S+pad)*OC,zb:(e.zb*F.wz*S+pad)*OC}};   // 8角の面は、角を結ぶ円より内側にへこむ（面の真ん中は 約92%）。その分(1/cos22.5°)だけ大きく作り、体が面の真ん中から突き抜けないようにする
    const dN=H.neckTop-aS[1];
    let P=[rA(H.neckTop-.02,.04),rA(H.neckTop-dN*.35,.05),rA(aS[1]-.04,.05),rA(.42,.045),rA(.30,.04),rA(.22,.04),rA(.18,.04),rA(.05,.05)];   // 首〜肩は体の形(rA)にそって決める。胸〜腰帯は下で、体の断面にぴったり合わせた8角形に決め直す
    P[0].rx=Math.max(P[0].rx,.12);let prx=P[0].rx;for(let i=1;i<3;i++){P[i].rx=Math.max(P[i].rx,prx);prx=P[i].rx}   // 首から肩へ広がる（胸当ての上の縁）
    const vOf=p=>{const o=[],zc=(p.zf-p.zb)/2,zk=(p.zf+p.zb)/2;for(let k=0;k<8;k++){const ph=k*Math.PI/4;o.push([p.rx*Math.sin(ph),zc+zk*Math.cos(ph)])}return o};   // 楕円の寸法(rx・zf・zb)から、8角形の8つの角の位置[横,前後]を作る（k=0:前 / 2:右 / 4:後ろ / 6:左）
    P.forEach(p=>{p.v=vOf(p)});
    const bodyTris=[];   // 鎧が包むべき体の三角形（胴＋左右の太もも）を、体の座標（横・高さ・前後）に直したもの。人間ベースは面が粗い（頂点の高さが飛び飛び）ので、頂点ではなく面を高さごとに切って測る
    for(const t of H.torso)bodyTris.push([0,1,2].map(k=>[t[k*3]*F.wx*S,yA(t[k*3+1]),(t[k*3+2]-hz)*F.wz*S]));
    for(const sx of[-1,1]){const d=H.leg[sx<0?'R':'L'],R1=gkAlign(d.hp,d.kn);for(const t of d.th)bodyTris.push([0,1,2].map(k=>{const q=R1([t[k*3]-d.hp[0],t[k*3+1]-d.hp[1],t[k*3+2]-d.hp[2]]);return[d.hp[0]*F.wx*S*F.lx+q[0]*F.thick*S,hipH+q[1]*F.leg*S,q[2]*F.thick*S]}))}
    const fit=(y0,y1,pad)=>{   // 高さ y1〜y0 の体の断面（面を高さごとに切った点）を、全部内側に入れる8角形を作る。8つの辺をそれぞれ、いちばん外の点にぴったり当てる（楕円より小さく、体にそう）。胴だけでなく太ももの出っ張り（尻・足の付け根）も入れる。戻り値=8つの角の位置[横,前後]
      const sel=[],N=8;
      for(const tri of bodyTris){let lo=1e9,hi=-1e9;for(const v of tri){lo=Math.min(lo,v[1]);hi=Math.max(hi,v[1])}
        if(hi<y1||lo>y0)continue;
        for(const v of tri)if(v[1]<=y0&&v[1]>=y1)sel.push(v);
        for(let st=0;st<=N;st++){const y=y1+(y0-y1)*st/N;if(y<lo||y>hi)continue;for(let e=0;e<3;e++){const a=tri[e],b=tri[(e+1)%3];if((a[1]-y)*(b[1]-y)<0){const u=(y-a[1])/(b[1]-a[1]);sel.push([a[0]+(b[0]-a[0])*u,y,a[2]+(b[2]-a[2])*u])}}}}
      if(!sel.length)return null;
      let zx=-1e9,zn=1e9;for(const q of sel){zx=Math.max(zx,q[2]);zn=Math.min(zn,q[2])}
      const cz=(zx+zn)/2,d=[],cd=Math.cos(Math.PI/8),sd=Math.sin(Math.PI/8),v=[];
      for(let e=0;e<8;e++){const ph=(e+.5)*Math.PI/4,nx=Math.sin(ph),nz=Math.cos(ph);let m=-1e9;for(const q of sel)m=Math.max(m,q[0]*nx+(q[2]-cz)*nz);d.push(m+pad)}   // 辺ごとの、中心からの距離（その向きにいちばん出ている点＋余白）
      for(let k=0;k<8;k++){const d1=d[(k+7)%8],d2=d[k],aa=(d1+d2)/(2*cd),bb=(d2-d1)/(2*sd),ph=k*Math.PI/4;v.push([aa*Math.sin(ph)+bb*Math.cos(ph),cz+aa*Math.cos(ph)-bb*Math.sin(ph)])}   // となりあう2辺の交点＝角
      return v};
    {const hb=.06*F.tor*S;for(const[i,yr]of[[3,.42],[4,.30],[5,.22],[6,.18],[7,.05]]){const f=fit(yA(yr)+hb,yA(yr)-hb,.03);if(f)P[i].v=f}}   // 胸〜腰帯の8角形は、胴と太ももの断面をすべて包む形に決め直す（腰から足の付け根で、体が前後に突き抜けないように）
    {const wx=[1,1.04,1.16,1.13,1.05,1,1,1],zf=[0,0,.01,.04,.03,.01,0,0],fw=[1,.6,0,0,0,0,0,.6];P.forEach((p,i)=>p.v.forEach((q,k)=>{q[0]*=wx[i];q[1]+=zf[i]*fw[k]}))}   // 鎧らしい輪郭: 肩と胸を張り出し（胸の前も少し盛り上げる）、腰は体のまま。肩幅が広く腰が細い逆三角形に見える。体より小さくはしない（肌が突き抜けない）
    if(bulge){const bm=[0,0,.03,.1,.09,.04,.01,0],fw=[1,.6,0,0,0,0,0,.6];P.forEach((p,i)=>p.v.forEach((q,k)=>{q[1]+=bm[i]*fw[k]}))}   // 胸が飛び出た胴鎧: 胸の高さの前の厚みだけ増やす（前へ張り出し、背中側は変わらない）
    P=P.filter((p,i,a)=>i===0||p.y<a[i-1].y-.01);
    P.forEach(p=>{p.rx=Math.max(Math.abs(p.v[2][0]),Math.abs(p.v[6][0]));p.zf=p.v[0][1];p.zb=-p.v[4][1]});   // 角の位置から、横幅・前・後ろのはし（星・襟・留め金の位置に使う）
    const np=P.length,Pb=P.slice(0,np-1),nb=Pb.length,rg=new THREE.LatheGeometry(Pb.map(p=>new THREE.Vector2(p.rx,p.y)),8),pp=rg.attributes.position;   // 胸当て=首〜腰(.18)までの8角の面（正面に稜線が通る）。その下は重ね板で作る
    for(let i=0;i<pp.count;i++){const q=Pb[i%nb].v[Math.floor(i/nb)%8];pp.setX(i,q[0]);pp.setZ(i,q[1])}   // 8つの角を、体の断面に合わせた位置へ
    add(body,rg,st,0,0,0);   // 胸当て（肩・胸が張り出し、正面に縦の稜線が通る。bulge の時は胸が前へ大きく飛び出る）
    const grow=(v,o)=>v.map((q,k)=>[q[0]+o*Math.sin(k*Math.PI/4),q[1]+o*Math.cos(k*Math.PI/4)]);   // 8角形を外へ広げる
    const oct=(vt,vb,yt,yb,fn)=>{const ps=[];for(let k=0;k<8;k++){const k2=(k+1)%8,a=[vt[k][0],yt,vt[k][1]],b=[vt[k2][0],yt,vt[k2][1]],c=[vb[k][0],yb,vb[k][1]],d=[vb[k2][0],yb,vb[k2][1]];ps.push(...a,...b,...c,...b,...d,...c)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(ps),3));g.computeVertexNormals();add(body,g,fn,0,0,0)};   // 上の8角形と下の8角形をつないだ帯の板（上下で広がり方が違ってよい）
    const band=(v,y,h,o,fn)=>{const g=grow(v,o);oct(g,g,y+h/2,y-h/2,fn)};   // 板の縁の帯（板より少し外へ出た細い帯）
    const rv=(v,y)=>{const g=grow(v,.014);for(const k of[1,7])add(body,new THREE.OctahedronGeometry(.028,0),brs,g[k][0],y,g[k][1])};   // 板の縁の前の角に打つびょう
    {const e=Pb[nb-1];band(e.v,e.y-.005,.04,.012,brs);rv(e.v,e.y-.005)}   // 胸当ての下の縁（板の端の線）とびょう
    {const t=P[nb],e=Pb[nb-1],lerp=(u,w,k)=>u+(w-u)*k;   // 腹の重ね板: 胸当ての下から腰帯まで2枚。下の板ほど少し広がり、下の縁に暗い線が出る
      for(let j=0;j<2;j++){const y0=lerp(e.y,t.y,j/2),y1=lerp(e.y,t.y,(j+1)/2),r=fit(y0+.01,y1-.02,.03)||(j?t.v:e.v),bot=grow(r,.014+j*.01);oct(grow(r,.002),bot,y0+.01,y1-.015,steel(1-j*.06));band(bot,y1-.015,.03,.004,stD);rv(bot,y1-.015)}}
    const pa=P[Math.min(3,np-1)],pb=P[Math.min(6,np-1)];
    if(armor==='blast'){   // 爆破の鎧: 胸の中央に、縦に長い4つ角の星（黒に近い赤の星の上に、赤の星を重ねる）
      const starG=(w,h,dep)=>{const sh=new THREE.Shape(),q=[[0,h*.78],[w*.3,h*.26],[w,0],[w*.3,-h*.4],[0,-h*1.25],[-w*.3,-h*.4],[-w,0],[-w*.3,h*.26]];sh.moveTo(q[0][0],q[0][1]);for(let i=1;i<q.length;i++)sh.lineTo(q[i][0],q[i][1]);sh.closePath();return new THREE.ExtrudeGeometry(sh,{depth:dep,bevelEnabled:false})};
      const sy=(pa.y+pb.y)/2+.04,sz=P[Math.min(4,np-1)].zf,sw=pa.rx*.36,shh=(pa.y-pb.y)*.55;
      add(body,starG(sw,shh,.11),k=>k.set(0x2a0d0e),0,sy,sz-.06);   // 下の星（黒に近い赤）
      add(body,starG(sw*.68,shh*.68,.09),k=>k.set(0xd0301f),0,sy,sz-.01)}   // 上の星（赤）
    else if(armor==='holy'){   // 高エネルギーの鎧: 胸の中央に、先が広がる十字（濃い金の十字の上に、明るい黄の十字を重ねる）
      const crossG=(L,dep)=>{const c=L*.2,e=L*.5,q=[[-e,L],[e,L],[c,c],[L,e],[L,-e],[c,-c],[e,-L],[-e,-L],[-c,-c],[-L,-e],[-L,e],[-c,c]],sh=new THREE.Shape();sh.moveTo(q[0][0],q[0][1]);for(let i=1;i<q.length;i++)sh.lineTo(q[i][0],q[i][1]);sh.closePath();return new THREE.ExtrudeGeometry(sh,{depth:dep,bevelEnabled:false})};
      const cy0=(pa.y+pb.y)/2+.04,cz0=P[Math.min(4,np-1)].zf,CL=Math.min(pa.rx*.42,(pa.y-pb.y)*.42);
      add(body,crossG(CL,.11),k=>k.set(0x9a6f10),0,cy0,cz0-.06);   // 下の十字（濃い金）
      add(body,crossG(CL*.8,.09),k=>k.set(0xffe45a),0,cy0,cz0-.01)}   // 上の十字（明るい黄）
    else{const kl=new THREE.OctahedronGeometry(1,0);kl.scale(.05,(pa.y-pb.y)/2+.02,.07);add(body,kl,stH,0,(pa.y+pb.y)/2,P[Math.min(4,np-1)].zf-.01)}   // 胸の中央の稜線（前へ盛り上がる縦のライン）
    const lp=P[np-1];
    if(pat){   // 表面の模様（胸〜腹の前の面）: 縦の筋 / 山形 / 鋲
      const surf=(sd,t,y)=>{let j=0;while(j<nb-2&&y<Pb[j+1].y)j++;const a=Pb[j],b=Pb[Math.min(j+1,nb-1)],u=b.y===a.y?0:Math.max(0,Math.min(1,(a.y-y)/(a.y-b.y))),k1=sd>0?1:7,pt=q=>[q.v[k1][0]*t,q.v[0][1]+(q.v[k1][1]-q.v[0][1])*t],c=pt(a),d=pt(b);return[c[0]+(d[0]-c[0])*u,y,c[1]+(d[1]-c[1])*u+.012]};   // 胸当ての前の面の上の点（sd=-1左/1右、t=0中央〜1横の角、y=高さ）
      const c1=pa.y-.05,c2=pb.y+.04;
      for(const sd of[-1,1]){
        if(pat==='ribs'){for(const t of[.42,.78])for(let m=0;m<4;m++)rod(body,surf(sd,t,c1+(c2-c1)*m/4),surf(sd,t,c1+(c2-c1)*(m+1)/4),.016,pcol)}
        else if(pat==='chevron'){for(let m=0;m<3;m++){const y0=c1-.04-m*(c1-c2)/3.4;rod(body,surf(sd,0,y0),surf(sd,.85,y0+.09),.016,pcol)}}
        else{for(const t of[.5,.85])for(let m=0;m<5;m++)add(body,new THREE.OctahedronGeometry(.026,0),pcol,...surf(sd,t,c1+(c2-c1)*m/4))}}}
    band(lp.v,lp.y,.07,.012,stD);   // 革の腰帯
    const bk=new THREE.OctahedronGeometry(1,0);bk.scale(.07,.06,.03);add(body,bk,brs,0,lp.y,lp.zf+.035);   // 帯の留め金（真鍮）
    for(let i=0;i<3;i++){const y0=lp.y-.005-i*.1,y1=y0-.13,r=fit(y0,y1-.02,.03)||lp.v;oct(grow(r,.004+i*.004),grow(r,.03+i*.01),y0,y1,steel(1-i*.07))}   // 草摺の段（腰から下へ3枚が重なって広がる。体と太ももの断面に合わせた8角形）
    const nk=P[0],gz=(nk.zf-nk.zb)/2;
    add(body,new THREE.CylinderGeometry(nk.rx*1.18,nk.rx*.95,.2,8,1,true),st,0,nk.y+.04,gz);flatRing(body,nk.rx*1.18,nk.y+.14,.02,brs,1,gz);   // 立ち襟（上へ広がる）＋縁どり
    const lx0=Math.abs(Lg.hp[0])*F.wx*S*F.lx,rpT=.11*S*F.thick+.035,hf=.17*S;
    for(const sd of[-1,1])add(body,new THREE.CylinderGeometry(rpT*1.3,rpT*1.45,.32,8,1,true,-1.0+sd*.25,2.0),st,sd*lx0,lp.y-.3,0);   // 腿の前をおおう湾曲した草摺板（箱ではなく円筒の一部）
    RB={yH:lp.y-hf,rH:lp.rx+.05,rW:lp.rx+.03,rN:nk.rx,zC:rA(.38,.05).zf+(bulge?.09:0)}}   // 装飾(gkSignature)が鎧の下に埋まらないよう目印を鎧の表面へ
  // 脚（右→左の順。腰→太もも→ひざ→すね→足首→足。ひざの曲がりは userData.kn・足先は userData.ft）
  for(const sx of[-1,1]){const d=H.leg[sx<0?'R':'L'],lg=new THREE.Group();lg.position.set(d.hp[0]*F.wx*S*F.lx,hipH,0);body.add(lg);
    const R1=gkAlign(d.hp,d.kn),R2=gkAlign(d.kn,d.ak),sc=r=>[r[0]*F.thick*S,r[1]*F.leg*S,r[2]*F.thick*S];
    add(lg,gkHumanGeo(d.th,(x,y,z)=>sc(R1([x-d.hp[0],y-d.hp[1],z-d.hp[2]]))),k=>k.copy(PL.body),0,0,0);
    const kn=new THREE.Group();kn.position.y=-legUp;lg.add(kn);lg.userData.kn=kn;
    const sh=gkHumanGeo(d.sh,(x,y,z)=>sc(R2([x-d.kn[0],y-d.kn[1],z-d.kn[2]])));add(kn,sh,k=>k.copy(PL.body),0,0,0);cap(kn,ringOf(sh));
    const ft=new THREE.Group();ft.position.y=-legLo;kn.add(ft);lg.userData.ft=ft;
    const fo=gkHumanGeo(d.ft,(x,y,z)=>[(x-d.ak[0])*F.thick*S,(y-d.ak[1])*S,(z-d.ak[2])*F.thick*S]);add(ft,fo,k=>k.copy(PL.skin),0,0,0);cap(ft,ringOf(fo));
    if(robed==='suit'){const rp=.11*S*F.thick+.05,V2s=p=>new THREE.Vector2(p[0],p[1]),pu=new THREE.LatheGeometry([[rp*1.05,.1],[rp*1.12,-legUp*.5],[rp*1.2,-legUp]].map(V2s),8),pl=new THREE.LatheGeometry([[rp*1.2,0],[rp*1.22,-legLo*.5],[rp*1.3,-legLo+.04]].map(V2s),8);
      add(lg,pu,k=>k.set(C.mantle),0,0,0);add(kn,pl,k=>k.set(C.mantle),0,0,0);   // ズボン: まっすぐでゆったり（太ももとすねで分け、ひざで曲がる）
      const pc=new THREE.TorusGeometry(rp*1.3,.025,5,10);pc.rotateX(Math.PI/2);add(kn,pc,k=>k.set(C.sash),0,-legLo+.04,0);
      if(DC.trim&&DC.trim.includes('cuff')){const tcf=dcf(DC.tcol,1.05),rgL=[{y:0,rx:rp*1.2,zr:rp*1.2,cz:0},{y:-legLo*.5,rx:rp*1.22,zr:rp*1.22,cz:0},{y:-legLo+.04,rx:rp*1.3,zr:rp*1.3,cz:0}];   // ズボンのすその縁取り
        dshell(kn,rgL,8,32,-legLo*.72,-legLo*.86,9,()=>true,tcf,.014);if(DC.dbl)dshell(kn,rgL,8,32,-legLo*.6,-legLo*.65,9,()=>true,tcf,.014)}}   // すその折り返し
    if(armor){const rp=.11*S*F.thick+.035,st=steel(1),st2=steel(.9);
      add(lg,new THREE.CylinderGeometry(rp*.98,rp*.9,legUp*.98,8,1,true),und,0,-legUp*.5,0);   // 腿の鎖かたびら（板の継ぎ目からのぞく）
      add(lg,new THREE.CylinderGeometry(rp*1.12,rp*.98,legUp*.62,8,1,true),st,0,-legUp*.4,0);flatRing(lg,rp*.99,-legUp*.71,.022,brs,1,0);   // 腿当て（上に寄せて、ひざ上に鎖を見せる）＋下縁（真鍮）
      const pl2=new THREE.SphereGeometry(1,8,5);pl2.scale(rp*1.12,.1*S,rp*1.15);add(kn,pl2,stH,0,0,rp*.5);   // 膝当て（ひざ頭をおおう丸み）
      const wg=new THREE.OctahedronGeometry(1,0);wg.scale(rp*.35,.06*S,rp*.5);for(const wx of[-1,1])add(kn,wg.clone(),st2,wx*rp*1.05,0,rp*.1);   // 膝の横の張り出し
      add(kn,new THREE.CylinderGeometry(rp*.84,rp*.68,legLo*.98,8,1,true),und,0,-legLo*.5,0);   // すねの鎖かたびら
      add(kn,new THREE.CylinderGeometry(rp*.96,rp*.77,legLo*.78,8,1,true),st,0,-legLo*.52,0);   // すね当て
      const sr=new THREE.OctahedronGeometry(1,0);sr.scale(.03*S,legLo*.34,.05*S);add(kn,sr,stH,0,-legLo*.5,rp*.8);   // すねの稜線（前の縦の盛り上がり）
      fo.computeBoundingBox();const bb=fo.boundingBox,fw=bb.max.x-bb.min.x+.05,fh2=bb.max.y-bb.min.y+.03,fl2=bb.max.z-bb.min.z+.05,fcx=(bb.max.x+bb.min.x)/2,fcy=(bb.max.y+bb.min.y)/2,fcz=(bb.max.z+bb.min.z)/2;
      const bg2=new THREE.CylinderGeometry(1,1,1,8);bg2.rotateX(Math.PI/2);bg2.scale(fw*.55,fh2*.55,fl2);add(ft,bg2,st2,fcx,fcy,fcz);   // 鉄靴（足を包む。角を落とした八角柱）
      const toe=new THREE.ConeGeometry(1,1,8);toe.rotateX(Math.PI/2);toe.scale(fw*.5,fh2*.5,.2);add(ft,toe,stH,fcx,fcy-fh2*.05,bb.max.z+.105)}   // 鉄靴のつま先（前へとがる）
    legArr.push(lg)}
  // 腕（右→左の順。調査員は上の2本＋下の2本）。肩を中心に振る。手のひらの位置に魔法の出る点(fists)。軍人は右手に巨大な剣
  let swHold=null,swBlade=null,swHold2=null,swBlade2=null,shdG=null;const swHA=[null,null,null,null],swBA=[null,null,null,null];
  for(const[s,low,rz0,qk]of (insp||arms4)?[[-1,0,.62,1],[1,0,.62,1],[-1,1,.42,.4],[1,1,.42,.4]]:[[-1,0,sold?.12:.2,1],[1,0,sold?.12:.2,1]]){
    const d=H.arm[s<0?'R':'L'],q=low?.85:1,A=new THREE.Group();
    let tw=0;if(low){const yh=d.S[1]-.2;for(const t of H.torso)for(let k=0;k<3;k++){const ax=t[k*3],ay=t[k*3+1],bx=t[(k+1)%3*3],by=t[(k+1)%3*3+1];if((ay-yh)*(by-yh)<=0&&ay!==by)tw=Math.max(tw,Math.abs(ax+(bx-ax)*(yh-ay)/(by-ay)))}}   // 下の腕の付け根の高さでの、胴の横のはしの位置（胴の面をその高さで水平に切った断面から求める。胴の内側に埋まらず、脇の表面から出す）
    A.position.set((low?s*(tw+.01):d.S[0])*F.wx*S,hipH+(d.S[1]-hy0)*F.tor*S-(low?.2*S*F.tor:0),(d.S[2]-hz)*F.wz*S+(low?.04*S*F.wz:0));A.rotation.z=s*rz0;A.userData.rz0=rz0;A.userData.qk=qk;body.add(A);arms.push(A);
    const Ra=gkAlign(d.S,d.W),lenA=lenOf(d.S,d.W)*F.arm*S*q;   // 肩から手首までの長さ
    const geo=gkHumanGeo(d.t,(x,y,z)=>{const r=Ra([x-d.S[0],y-d.S[1],z-d.S[2]]);return[r[0]*F.thick*S*q,r[1]*F.arm*S*q,r[2]*F.thick*S*q]});
    add(A,geo,(k,x,y)=>k.copy(y<-lenA?PL.skin:PL.arm),0,0,0);
    if(robed==='wide'){const r0=.1*S*F.thick*q+.03,sg2=new THREE.LatheGeometry([[r0,.02],[r0*1.5,-lenA*.5],[r0*2.5,-lenA*.98]].map(p=>new THREE.Vector2(p[0],p[1])),8);add(A,sg2,(k,x,y)=>k.set(C.sleeve).multiplyScalar(.95+.25*y/lenA),0,0,0)}   // ゆったり型: 手首へ向かって広がるベル型の袖（手は袖から出る）
    if(robed==='suit'){const r0=.095*S*F.thick*q+.03,sg3=new THREE.LatheGeometry([[r0,.02],[r0*1.08,-lenA*.5],[r0*1.18,-lenA*.97]].map(p=>new THREE.Vector2(p[0],p[1])),8);add(A,sg3,(k,x,y)=>k.set(C.sleeve).multiplyScalar(.95+.15*y/lenA),0,0,0);
      const cf=new THREE.TorusGeometry(r0*1.18+.012,.03,5,10);cf.rotateX(Math.PI/2);add(A,cf,k=>k.set(C.sash),0,-lenA*.95,0)}   // 上着: まっすぐな長袖＋袖口の帯（スケッチ）
    if(robed&&(DC.pat||DC.trim)){   // 袖の模様（ゆったり型・上着の袖）と袖口の縁取り（コートは腕に帯を巻く）
      const tcf=DC.trim?dcf(DC.tcol,1.05):null,hasC=DC.trim&&DC.trim.includes('cuff');
      if(robed==='wide'||robed==='suit'){const w2=robed==='wide',r0s=(w2?.1:.095)*S*F.thick*q+.03,pts=w2?[[r0s,.02],[r0s*1.5,-lenA*.5],[r0s*2.5,-lenA*.98]]:[[r0s,.02],[r0s*1.08,-lenA*.5],[r0s*1.18,-lenA*.97]],rgA=pts.map(p=>({y:p[1],rx:p[0],zr:p[0],cz:0})),cb=w2?[.84,.97]:[.78,.9],db=w2?[.72,.78]:[.66,.72],py=w2?.68:.6;
        if(DC.pat)dshell(A,rgA,8,32,-lenA*.06,-lenA*py,.045,dmask(DC.pat),dcf(DC.pcol,1),.008);
        if(hasC){dshell(A,rgA,8,32,-lenA*cb[0],-lenA*cb[1],9,()=>true,tcf,.014);if(DC.dbl)dshell(A,rgA,8,32,-lenA*db[0],-lenA*db[1],9,()=>true,tcf,.014)}}
      else if(hasC){const gp0=geo.attributes.position;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
        for(let i=0;i<gp0.count;i++){const yy=gp0.getY(i);if(yy<-lenA*.8&&yy>-lenA*.9){x0=Math.min(x0,gp0.getX(i));x1=Math.max(x1,gp0.getX(i));z0=Math.min(z0,gp0.getZ(i));z1=Math.max(z1,gp0.getZ(i))}}   // 手首の少し上の腕の太さ（断面の範囲）
        if(x1>x0){const bh=.07*DC.tw,cg2=new THREE.CylinderGeometry(1,1,bh,10,1,true);cg2.scale((x1-x0)/2+.014,1,(z1-z0)/2+.014);add(A,cg2,tcf,(x0+x1)/2,-lenA*.86,(z0+z1)/2);
          if(DC.dbl){const cg3=new THREE.CylinderGeometry(1,1,bh*.45,10,1,true);cg3.scale((x1-x0)/2+.014,1,(z1-z0)/2+.014);add(A,cg3,tcf,(x0+x1)/2,-lenA*.86+bh*1.3,(z0+z1)/2)}}}}
    const sg=new THREE.SphereGeometry(1,6,4);sg.scale(.07*S*F.thick*q,.07*S*F.thick*q,.07*S*F.thick*q);add(A,sg,k=>k.copy(PL.arm),0,0,0);   // 肩の球（腕を上げた時に胴との切れ目を隠す）
    const gp=geo.attributes.position;let mn=0,zs=0,zn=0,hx0=1e9,hx1=-1e9,hz0=1e9,hz1=-1e9;for(let i=0;i<gp.count;i++){mn=Math.min(mn,gp.getY(i));if(gp.getY(i)<-lenA){zs+=gp.getZ(i);zn++;hx0=Math.min(hx0,gp.getX(i));hx1=Math.max(hx1,gp.getX(i));hz0=Math.min(hz0,gp.getZ(i));hz1=Math.max(hz1,gp.getZ(i))}}
    const gx=zn?(hx0+hx1)/2+GKGRIP.X:GKGRIP.X,gz=zn?(hz0+hz1)/2+GKGRIP.Z:GKGRIP.Z;   // 握る位置＝手の頂点の範囲（横・前後）の中心。手の甲側に寄らないよう、手の厚みの真ん中にする
    const palmY=(-lenA+mn)/2+GKGRIP.Y,anchor=new THREE.Group();anchor.position.set(gx,palmY,gz);A.add(anchor);fists.push(anchor);   // 魔法を出す位置（手のひらのあたり）
    if(armor){const rr=.09*S*F.thick*q,pk=armor==='holy'?1.3:1,st=steel(1),st2=steel(.82),cy=(r0,r1,y0,y1,fn)=>{const h=Math.max(.04,y0-y1);add(A,new THREE.CylinderGeometry(r0,r1,h,8,1,true),fn||st,0,(y0+y1)/2,0)};
      cy(rr*.98,rr*.9,-rr*.6,-lenA*.95,und);   // 腕の鎖かたびら（板と板の継ぎ目からのぞく暗い層）
      const dome=new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI*.6);dome.scale(rr*1.6*pk,rr*1.15*pk,rr*1.5*pk);add(A,dome,stH,0,rr*.1,0);   // 肩当ての頂（外へ張り出す）
      flatRing(A,rr*1.55*pk,-rr*.1,rr*.1,brs,1,0);   // 肩当ての縁どり
      if(pat){const dpt=(ph,th)=>[1.04*Math.sin(ph)*Math.cos(th)*1.6*rr*pk,rr*.1+1.04*Math.cos(ph)*1.15*rr*pk,1.04*Math.sin(ph)*Math.sin(th)*1.5*rr*pk];   // 肩当ての丸い面の上の点（ph=頂からの角度 / th=まわりの角度）の模様
        if(pat==='ribs'){for(let k=0;k<4;k++)for(let m=0;m<3;m++)rod(A,dpt(m*.2*Math.PI,k*Math.PI/2+Math.PI/4),dpt((m+1)*.2*Math.PI,k*Math.PI/2+Math.PI/4),rr*.07,pcol)}
        else if(pat==='chevron'){for(let k=0;k<8;k++)rod(A,dpt(.35*Math.PI,k*Math.PI/4),dpt(.35*Math.PI,(k+1)*Math.PI/4),rr*.07,pcol)}
        else{for(let k=0;k<8;k++){const q=dpt(.55*Math.PI,k*Math.PI/4);add(A,new THREE.OctahedronGeometry(rr*.09,0),pcol,q[0],q[1],q[2])}}}
      cy(rr*1.4*pk,rr*1.55*pk,-rr*.1,-rr*.8);cy(rr*1.38*pk,rr*1.5*pk,-rr*.62,-rr*1.3,steel(.88));   // 肩当ての重ね板（下へ広がりながら重なる）
      if(armor==='blast'&&!low){   // 爆破の鎧: 肩から尖った四角錐のトゲ。大きな1本は上へ（外へ少し開く）、小さな1本は外へ突き出す。腕の傾き(rz0)を引いて、体から見て同じ向きになるようにする
        const tk=(len,rad,tilt,px,py,fn)=>{const gS=new THREE.Group();gS.position.set(px,py,0);gS.rotation.z=-s*(tilt+rz0);A.add(gS);add(gS,new THREE.ConeGeometry(rad,len,4),fn,0,len/2,0)};
        tk(rr*3.4,rr*.55,.3,s*rr*.2,rr*.7,stH);tk(rr*2.1,rr*.4,1.2,s*rr*.9,rr*.4,st2)}
      cy(rr*1.08,rr*1.0,-rr*1.25,-lenA*.42);flatRing(A,rr*1.04,-lenA*.42,rr*.1,brs,1,0);   // 二の腕の板＋下縁
      const el=new THREE.SphereGeometry(1,8,5);el.scale(rr*1.3,rr*1.0,rr*1.3);add(A,el,stH,0,-lenA*.5,-rr*.25);   // ひじ当て（丸いお椀）
      const ef=new THREE.OctahedronGeometry(1,0);ef.scale(rr*.25,rr*.75,rr*.95);add(A,ef,st2,0,-lenA*.5,-rr*1.2);   // ひじの後ろへ張り出す板
      cy(rr*1.08,rr*1.28,-lenA*.57,-lenA*.92);flatRing(A,rr*1.28,-lenA*.92,rr*.1,brs,1,0);   // 前腕の板（手首へ広がる）＋縁
      if(zn>0){const gw=Math.max(.14,hx1-hx0)+.06,gd=Math.max(.12,hz1-hz0)+.06,gy0=-lenA*.93,gy1=mn-.02,gcx=(hx0+hx1)/2,gcz=(hz0+hz1)/2;
        const gg3=new THREE.CylinderGeometry(.55,.46,1,8);gg3.scale(gw,gy0-gy1,gd);add(A,gg3,st2,gcx,(gy0+gy1)/2,gcz);   // 籠手（手を包む。角を落とした八角柱で、指先へ細くなる）
        const cf=new THREE.CylinderGeometry(.62,.8,.1,8,1,true);cf.scale(gw,1,gd);add(A,cf,st,gcx,gy0+.02,gcz)}}   // 手首で広がる袖口
    if(shield==='small'&&s>0&&!low&&!shdG){   // 小盾（バックラー）: 小さな丸い盾。ふだんは左手の外側に提げ、出す時は腕を前へ伸ばして手の先に構える（位置・向きは gkShieldStep が補間する）
      const bt=hipH+(H.neckTop-hy0)*F.tor*S,Rb=bt*SHD.SM_R,stl=steel(1),shg=new THREE.Group(),inn=new THREE.Group();shg.add(inn);A.add(shg);
      const disc=new THREE.CylinderGeometry(Rb,Rb,.045,14);disc.rotateX(Math.PI/2);add(inn,disc,k=>{k.set(0x5c4630).multiplyScalar(.9+.1*Math.random())},0,0,0);   // 板（面が+Z側＝相手の側）
      add(inn,new THREE.TorusGeometry(Rb,.028,5,14),stl,0,0,0);   // 縁
      const bo=new THREE.SphereGeometry(Rb*.38,8,6);bo.scale(1,1,.6);add(inn,bo,stl,0,0,.03);   // 中央のふくらみ
      const hxm=(zn?hx1:gx)+(armor?.06:.03),pLow=new THREE.Vector3(hxm+.1,palmY+.02,gz),qLow=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2,0)),   // 提げている時: 手の外側・面が真横を向く
        pHigh=new THREE.Vector3(gx,mn-.1,gz),qHigh=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0));   // 出した時: 腕を前に伸ばした手の先・面が正面を向く
      shg.position.copy(pLow);shg.quaternion.copy(qLow);shg.userData={pLow,qLow,pHigh,qHigh,small:true};shdG=shg}
    if(shield==='big'&&s>0&&!low&&!shdG){   // 盾: 左手が空いている時だけ。体ほどの大きさの、やや曲がった四角い盾。ふだんは左腕の外側に提げ、出す時は腕ごと体の前へ（位置・向きは gkShieldStep が補間する）
      const bt=hipH+(H.neckTop-hy0)*F.tor*S,Hs=bt*SHD.H,TH=SHD.CURVE,Ws=Hs*SHD.W,R=Ws/(2*Math.sin(TH/2)),stl=steel(1),shg=new THREE.Group(),inn=new THREE.Group();   // Hs=盾の高さ（体の高さの何割か） / Ws=横幅 / TH=曲がり（円筒の何rad分か） / R=曲がりの半径
      shg.add(inn);A.add(shg);
      const plate=new THREE.CylinderGeometry(R,R,Hs,10,1,true,-TH/2,TH);plate.translate(0,0,-R);add(inn,plate,k=>{k.set(0x5c4630).multiplyScalar(.9+.1*Math.random())},0,0,0);   // 盾の板（出っ張る面が+Z側＝相手の側）
      for(const sy of[-1,1]){const bd=new THREE.CylinderGeometry(R+.025,R+.025,.07,10,1,true,-TH/2,TH);bd.translate(0,0,-R);add(inn,bd,stl,0,sy*(Hs/2-.035),0)}   // 上下の縁
      for(const sx of[-1,1]){const bd=new THREE.CylinderGeometry(R+.025,R+.025,Hs,2,1,true,sx<0?-TH/2:TH/2-.08,.08);bd.translate(0,0,-R);add(inn,bd,stl,0,0,0)}   // 左右の縁
      const bo=new THREE.SphereGeometry(.12,8,6);bo.scale(1,1,.55);add(inn,bo,stl,0,0,.02);   // 中央のふくらみ
      const sag=R*(1-Math.cos(TH/2)),hxm=(zn?hx1:gx)+(armor?.06:.03),pLow=new THREE.Vector3(hxm+sag+.08,palmY+Hs*.05,gz),   // 盾の内側の縁（apexから曲がりの深さ sag だけ体側）が、手（籠手）の外側より外に来るようにして、手が盾に刺さらない
        qLow=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2,0)),   // 提げている時: 腕の外側・板の面が真横を向く
        pHigh=new THREE.Vector3(-A.position.x,mn-.1-sag,bt*SHD.Y-A.position.y),   // 出した時: 盾の縁が手の先（mn）より前に来るように、手の先から離して構える
        qHigh=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0));   // 出した時: 腕を前へ伸ばした先・体の中心・面が正面を向く（腕を前に水平にした時、腕の-Yが前・+Zが上になる）
      shg.position.copy(pLow);shg.quaternion.copy(qLow);shg.userData={pLow,qLow,pHigh,qHigh};shdG=shg}
    if(sold&&(weapon==='quad'||((s<0||(weapon==='dual'&&s>0))&&!low))){const sh=new THREE.Group();sh.position.set(gx,palmY,gz);sh.rotation.x=Math.PI+SSW_REST[1];A.rotation.order='YXZ';A.add(sh);   // 軍人: 腕は先に前後に振ってから体の縦軸で左右に振る(YXZ)。右手に巨大な剣。握りの中心を手に合わせる。向きは毎フレーム mageStep が決める
      const sp0=weapon==='spear',gr0=weapon==='great',ax0=weapon==='axe',bs=gr0?(gkGreatModel||(gkGreatModel=makeGkGreat())).clone():ax0?(gkAxeModel||(gkAxeModel=makeGkAxe())).clone():sp0?(gkSpearModel||(gkSpearModel=makeGkSpear(IRON_COLOR))).clone():(creGkSword||(creGkSword=makeGkSword())).clone();bs.rotation.y=Math.PI/2;   // 槍型は剣のかわりに鉄の槍（握りは柄の途中）
      if(gr0){bs.scale.set(GSW.SCALE*GSW.WIDE,GSW.SCALE,GSW.SCALE*GSW.WIDE);bs.position.y=-GSW.GRIP*GSW.SCALE}else if(ax0){bs.scale.set(AXE.SCALE*AXE.WIDE,AXE.SCALE,AXE.SCALE*AXE.WIDE);bs.position.y=-AXE.GRIP*AXE.SCALE}else if(sp0){bs.scale.set(SPR.SCALE*SPR.WIDE,SPR.SCALE,SPR.SCALE*SPR.WIDE);bs.position.y=-SPR.GRIP*SPR.SCALE}else{const SC=weapon==='dual'?DW.SCALE:weapon==='quad'?DW.SCALE*.9:SSW.SCALE;bs.scale.set(SC*SSW.WIDE,SC,SC*SSW.WIDE);bs.position.y=-.2*SC}   // 双剣は片手剣より少し小さい
      bs.traverse(m=>{if(m.isMesh)m.castShadow=true});sh.add(bs);if(weapon==='quad'){swHA[arms.length-1]=sh;swBA[arms.length-1]=bs}else if(s<0){swHold=sh;swBlade=bs}else{swHold2=sh;swBlade2=bs}}}   // 四刀流は4本の腕すべて（腕の順は 右上・左上・右下・左下）
  // 頭: 体は人間ベースだが、頭だけは従来の異形のまま（菱形 / ラッパ / 円錐 / 輪）。首の少し上に浮かぶ。頭の中心が原点（属性の頭飾りは gkSignature が headTop を目安に付ける）
  const V2=a=>a.map(q=>new THREE.Vector2(q[0],q[1])),hsh=headShape||'diamond';let hGeo,hEx=.045,hEy=.03,hEz=.075,headTop=.34;   // 目の位置は形ごとに表面へ合わせる
  const HFH=!!(armor&&helm);const HSC=(GKHELM.BY&&GKHELM.BY[frame])||GKHELM.SC;   // 全身鎧＋兜: 頭の形（菱形・ラッパ・円錐・輪）のかわりに、フルフェイスの兜を頭にする
  if(HFH){hGeo=new THREE.SphereGeometry(1,12,9);hGeo.scale(helm.dm[0]*HSC,helm.dm[1]*HSC,helm.dm[2]*HSC);hEx=.078;hEy=.04;hEz=.2;headTop=(helm.dm[1]+.02)*HSC}   // 兜の後頭部（なめらかな楕円体）。目は面頬のすき間の位置
  else if(hsh==='funnel'){hGeo=new THREE.LatheGeometry(V2([[.001,-.28],[.13,-.28],[.13,-.045],[.153,.08],[.2,.17],[.234,.224],[.27,.28],[.001,.28]]),8);hEy=-.1;hEz=.127;headTop=.28}
  else if(hsh==='cone'){hGeo=new THREE.ConeGeometry(.24,.62,8);hEy=-.06;hEz=.138;headTop=.31}
  else if(hsh==='ring'){hGeo=new THREE.TorusGeometry(.24,.06,6,12,Math.PI*2-.7);hGeo.rotateZ(Math.PI/2+.35);hGeo.scale(1,1,.7);hEx=.07;hEy=-.235;hEz=.046;headTop=.3}
  else{hGeo=new THREE.OctahedronGeometry(1,0);hGeo.scale(.13,.34,.12)}
  const hk=F.head;if(hk!==1){hGeo.scale(hk,hk,hk);hEx*=hk;hEy*=hk;hEz*=hk;headTop*=hk}
  const headY=hipH+(H.neckTop-hy0)*F.tor*S+headTop+.14-(HFH?.1*hk:0);   // 首の上端から .14 浮かせる（兜は首当てが下に付くので、その分だけ下げる）
  const head=new THREE.Group();head.position.set(0,headY,(-.03-hz)*F.wz*S);body.add(head);
  if(!HFH)mageJit(hGeo,0,0,0);add(head,hGeo,HFH?steel(.85):k=>k.copy(PL.head),0,0,0);
  const eyeMat=new THREE.MeshBasicMaterial({color:C.eye}),eyeGeo=new THREE.BoxGeometry(.04,.014,.01),eyes=new THREE.Group();   // 光る細い目
  for(const sd of HFH?[]:[-1,1]){const e=new THREE.Mesh(eyeGeo,eyeMat),jv=HFH?[0,0,0]:mageJf(sd*hEx,hEy,hEz);e.position.set(sd*hEx+jv[0],hEy+jv[1],hEz+jv[2]);e.rotation.z=-sd*.25;eyes.add(e)}   // 頭の表面のゆがみに合わせて目もずらす
  head.add(eyes);
  if(DC.hat&&!HFH){   // 服の装飾の頭飾り（色は服と同じ C.robe。属性の色への塗り直しにも追従）: witch=ツバの長い魔女風の帽子 / top=シルクハット / mask=顔の下半分を覆う円錐のマスク（目は上に出る）
    const hg=new THREE.Group();hg.scale.setScalar(hk);head.add(hg);const hf=m=>(k,x,y,z)=>{k.set(C.robe).multiplyScalar((m||1)*(.93+.07*Math.sin(x*43+y*37+z*29)))},bf=dcf('dark',1),by=({funnel:.2,cone:.1,ring:.2})[hsh]||.07;
    if(DC.hat==='witch'){const hat=new THREE.Group();hat.position.y=by;hat.rotation.x=.08;hg.add(hat);
      add(hat,new THREE.LatheGeometry(V2([[.1,.0],[.3,-.012],[.55,.0],[.64,.05],[.61,.056],[.55,.03],[.3,.03],[.1,.06]]),10),hf(1),0,0,0);   // 長いツバ（先が少し反る）
      add(hat,new THREE.LatheGeometry(V2([[.17,.03],[.13,.22],[.085,.42],[.04,.58],[.001,.66]]),10),hf(.95),0,0,0);   // 高い円錐の山
      const hb=new THREE.TorusGeometry(.16,.02,5,10);hb.rotateX(Math.PI/2);add(hat,hb,bf,0,.09,0);   // 帯
      headTop=Math.max(headTop,(by+.66)*hk)}
    else if(DC.hat==='top'){const hat=new THREE.Group();hat.position.y=by;hat.rotation.x=.05;hg.add(hat);
      add(hat,new THREE.LatheGeometry(V2([[.1,.0],[.25,-.01],[.3,.02],[.28,.034],[.1,.05]]),12),hf(1),0,0,0);   // 狭いツバ
      add(hat,new THREE.LatheGeometry(V2([[.15,.03],[.15,.36],[.001,.36]]),12),hf(.95),0,0,0);   // 筒の山（上は平ら）
      const hb=new THREE.TorusGeometry(.152,.022,5,12);hb.rotateX(Math.PI/2);add(hat,hb,bf,0,.09,0);
      headTop=Math.max(headTop,(by+.37)*hk)}
    else if(DC.hat==='mask'){   // 顔に置き換わる円錐のフェイスマスク: 頭は隠れ、背の高い円錐が頭の位置を覆う。目は光らず、黒い穴が2つ（スケッチどおり）
      const r=({funnel:.3,cone:.28,ring:.3})[hsh]||.2,H2=3.8*r,y0=-.3,cg=new THREE.ConeGeometry(r,H2,12,1,true);cg.scale(1,1,.88);   // 底は首の上、先は頭の上へ高く
      if(head.children[0])head.children[0].visible=false;while(eyes.children.length)eyes.remove(eyes.children[0]);
      add(hg,cg,hf(1),0,y0+H2/2,0);
      const bg=new THREE.CircleGeometry(r,12);bg.rotateX(Math.PI/2);add(hg,bg,hf(.8),0,y0,0);   // 底のふた
      const yE=y0+H2*.26,rho=r*(1-.26),al=Math.atan(r/H2);
      for(const sx of[-1,1]){const ex=sx*rho*.38,ez=.88*rho*Math.sqrt(Math.max(.05,1-Math.pow(ex/rho,2)))+.004,eg=new THREE.CircleGeometry(r*.17,10);eg.scale(1,1.15,1);eg.rotateX(-al);add(hg,eg,k=>k.set(0x040404),ex,yE,ez)}   // 目の穴（円錐の表面にそって傾ける）
      headTop=Math.max(headTop,(y0+H2)*hk)}
  }
  if(HFH){   // フルフェイスの兜（素体 round / wedge / tall × 追加パーツ spike / arch / crest / horns をランダムに組み合わせる。helm=gkRollHelm の結果）。単位は兜の元の大きさで作り、最後に K 倍して置く / 目は無し: 顔板に無数の穴 / 色は鎧と同じ
    const K=hk*HSC,dm=helm.dm,RX=dm[0],RY=dm[1],RZ=dm[2],D=Math.PI/180,hm1=steel(1.12),hm2=steel(1),B0=helm.body,PT=helm.parts,HM=helm.holes,CW=helm.cw;
    const mkg=pos=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g};
    const addg=(g,fn,x,y,z)=>{g.scale(K,K,K);add(head,g,fn,(x||0)*K,(y||0)*K,(z||0)*K)};
    const nz=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
    const sf=(th,ps,off)=>{const cp=Math.cos(ps),x=RX*cp*Math.sin(th),y=RY*Math.sin(ps),z=RZ*cp*Math.cos(th),nx=x/(RX*RX),ny=y/(RY*RY),nzz=z/(RZ*RZ),nl=Math.hypot(nx,ny,nzz)||1;return[x+nx/nl*off,y+ny/nl*off,z+nzz/nl*off]};   // 後頭部の楕円体の表面の点（th=正面から横への角 / ps=高さの角 / off=外へのずらし）
    const cells=(mask,off,fn)=>{const NT=64,NP=28,P0=-80*D,DP=170*D/NP,pos=[];for(let j=0;j<NP;j++){const pc=(P0+DP*(j+.5))/D;for(let i=0;i<NT;i++){const t0=-Math.PI+2*Math.PI*i/NT,tc=(t0+Math.PI/NT)/D;if(!mask(Math.abs(tc),pc))continue;
        const a=sf(t0,P0+DP*j,off),b=sf(t0+2*Math.PI/NT,P0+DP*j,off),c=sf(t0,P0+DP*(j+1),off),d=sf(t0+2*Math.PI/NT,P0+DP*(j+1),off);pos.push(...a,...b,...c,...b,...d,...c)}}
      if(pos.length)addg(mkg(pos),fn,0,0,0)};
    const rvt=[],R8=.011,V8=[[R8,0,0],[-R8,0,0],[0,R8,0],[0,-R8,0],[0,0,R8],[0,0,-R8]],F8=[[4,0,2],[4,2,1],[4,1,3],[4,3,0],[5,2,0],[5,1,2],[5,3,1],[5,0,3]];   // びょう（小さな八面体）の材料
    const rivet=(c)=>{for(const f of F8)for(const q of f)rvt.push(c[0]+V8[q][0],c[1]+V8[q][1],c[2]+V8[q][2])};
    if(B0==='round'){   // 素体1: 丸い顔板（楕円体にそう。中央が高く、頬が一段低い。後ろの縁は耳でいちばん後ろ→あごへ斜め）
      const fmax=ps=>ps>=10?Math.max(10,84-(ps-10)*70/65):Math.max(28,84-(10-ps)*56/70),plate=(a,ps)=>ps>-64&&ps<78&&a<=fmax(ps),cen=(a,ps)=>a<=fmax(ps)*CW;
      const zone=(a,ps,m)=>HM==='full'?(ps>=-56-m&&ps<=64+m&&a<=fmax(ps)-10+m):((ps>=-8-m&&ps<=28+m&&a<=46+m)||(HM==='band+mouth'&&ps>=-54-m&&ps<=-22+m&&a<=26+m)),hz=(a,ps)=>zone(a,ps,0)&&a<=fmax(ps)-10&&Math.abs(a-fmax(ps)*CW)>3;   // zone=穴をあける範囲
      cells((a,ps)=>plate(a,ps)&&cen(a,ps),.016,hm1);cells((a,ps)=>plate(a,ps)&&!cen(a,ps),.008,hm2);
      {const pos=[],r=1.7*D;for(let ps=-54,row=0;ps<=64;ps+=5,row++)for(let th=(row%2?2.5:0);th<=50;th+=5)for(const sg of th?[-1,1]:[1]){const a=th;if(!hz(a,ps))continue;
          const o=(a<=fmax(ps)*CW?.016:.008)+.0008,c=sf(sg*th*D,ps*D,o),cs=Math.max(.3,Math.cos(ps*D)),vs=[];for(let k=0;k<6;k++){const ag=k*Math.PI/3;vs.push(sf(sg*th*D+r*Math.cos(ag)/cs,ps*D+r*Math.sin(ag),o))}
          for(let k=0;k<6;k++)pos.push(...c,...vs[k],...vs[(k+1)%6])}
        if(pos.length)addg(mkg(pos),k=>k.set(0x07070a),0,0,0)}   // 無数の穴（暗い六角形）
      for(let ps=-48,row=0;ps<=60;ps+=helm.rv,row++)for(let th=(row%2?helm.rv/2:0);th<=90;th+=helm.rv)for(const sg of th?[-1,1]:[1]){const a=th;if(a>fmax(ps)-8||zone(a,ps,5))continue;rivet(sf(sg*th*D,ps*D,(a<=fmax(ps)*CW?.016:.008)+.002))}
    }else{   // 素体2・3: 角ばった平らな顔板が前下へとがる(wedge) / 縦長で丸みのある顔板(tall)。顔板を、(u=左右・v=上から下)の曲面として作る
      const PP=B0==='wedge'?{yt:.52,yb:-.92,zk:1.35,hwt:.55,hwe:.98,hwb:.38,ve:.38,qc:1,bg:0}:{yt:.72,yb:-.92,zk:1.12,hwt:.62,hwe:.95,hwb:.62,ve:.4,qc:2.2,bg:.04},zk=1+(PP.zk-1)*helm.pk;   // zk=あごの先の前への出っぱり / qc=断面の丸さ(1=平らなV字) / hw*=顔板の半幅(上・耳・あご)
      const ytop=PP.yt*RY,ybot=PP.yb*RY,zsk=(x,y)=>RZ*Math.sqrt(Math.max(.03,1-Math.pow(x/RX,2)-Math.pow(y/RY,2))),z0=zsk(0,ytop)+.012;
      const hwF=v=>RX*(v<=PP.ve?PP.hwt+(PP.hwe-PP.hwt)*v/PP.ve:PP.hwe+(PP.hwb-PP.hwe)*(v-PP.ve)/(1-PP.ve));
      const P0f=(u,v)=>{const y=ytop+(ybot-ytop)*v,hw=hwF(v),zc=z0+(RZ*zk-z0)*v+PP.bg*Math.sin(Math.PI*v),zs=Math.min(zsk(hw,y)+.006,zc-.01),b=1-Math.pow(Math.min(1.2,Math.abs(u)),PP.qc),x=u*hw,z=zs+(zc-zs)*b,e=Math.pow(x/RX,2)+Math.pow(y/RY,2)+Math.pow(z/RZ,2),s=e<1.06?Math.sqrt(1.06/Math.max(e,.05)):1;return[x*s,y*s,z*s]};   // 後頭部の楕円体にめり込む所は、外へ押し出す（平らな面が丸い頭から突き出ないように）
      const nrm=(u,v)=>{const e=.002,a=P0f(u+e,v),b=P0f(u-e,v),c=P0f(u,v+e),d=P0f(u,v-e),Pu=[a[0]-b[0],a[1]-b[1],a[2]-b[2]],Pv=[c[0]-d[0],c[1]-d[1],c[2]-d[2]];return{n:nz([Pv[1]*Pu[2]-Pv[2]*Pu[1],Pv[2]*Pu[0]-Pv[0]*Pu[2],Pv[0]*Pu[1]-Pv[1]*Pu[0]]),Pu,Pv}};   // 面の外向きの向きと、横・縦の接線
      const PS=(u,v,off)=>{const p=P0f(u,v);if(!off)return p;const q=nrm(u,v).n;return[p[0]+q[0]*off,p[1]+q[1]*off,p[2]+q[2]*off]};
      const NU=16,NV=14,pos1=[],pos2=[];
      for(let iu=0;iu<NU;iu++)for(let iv=0;iv<NV;iv++){const uc=-1+2*(iu+.5)/NU,cen=Math.abs(uc)<=CW,off=cen?.016:.008,u0=-1+2*iu/NU,u1=-1+2*(iu+1)/NU,v0=iv/NV,v1=(iv+1)/NV,a=PS(u0,v0,off),b=PS(u1,v0,off),c=PS(u0,v1,off),d=PS(u1,v1,off);(cen?pos1:pos2).push(...a,...c,...b,...b,...c,...d)}
      addg(mkg(pos1),hm1,0,0,0);addg(mkg(pos2),hm2,0,0,0);   // 顔板: 中央（高い）と頬（一段低い）
      const zoneV=(v,m)=>HM==='full'?(v>=.06-m&&v<=.94+m):((v>=.18-m&&v<=.46+m)||(HM==='band+mouth'&&v>=.7-m&&v<=.9+m));
      {const pos=[],r=.0068;for(let y=ytop*.98,row=0;y>=ybot*.98;y-=.02,row++){const v=(y-ytop)/(ybot-ytop);if(!zoneV(v,0))continue;const hw=hwF(v);
          for(let x=(row%2?.01:0);x<=hw*.88;x+=.02)for(const sg of x?[-1,1]:[1]){const u=sg*x/hw;if(Math.abs(Math.abs(u)-CW)<.07)continue;
            const o=(Math.abs(u)<=CW?.016:.008)+.0008,c=PS(u,v,o),nn=nrm(u,v),tu=nz(nn.Pu),tv=nz(nn.Pv),vs=[];for(let k=0;k<6;k++){const ag=k*Math.PI/3,ca=Math.cos(ag)*r,sa=Math.sin(ag)*r;vs.push([c[0]+ca*tu[0]+sa*tv[0],c[1]+ca*tu[1]+sa*tv[1],c[2]+ca*tu[2]+sa*tv[2]])}
            for(let k=0;k<6;k++)pos.push(...c,...vs[(k+1)%6],...vs[k])}}
        if(pos.length)addg(mkg(pos),k=>k.set(0x07070a),0,0,0)}   // 無数の穴（暗い六角形。面の接線にそって貼る）
      for(let y=ytop*.95,row=0;y>=ybot*.95;y-=.045,row++){const v=(y-ytop)/(ybot-ytop);if(zoneV(v,.06))continue;const hw=hwF(v);
        for(let x=(row%2?.0225:0);x<=hw*.85;x+=.045)for(const sg of x?[-1,1]:[1]){const u=sg*x/hw;if(Math.abs(Math.abs(u)-CW)<.08)continue;rivet(PS(u,v,(Math.abs(u)<=CW?.016:.008)+.002))}}
    }
    if(rvt.length)addg(mkg(rvt),brs,0,0,0);   // びょう（gold の時だけ金色）
    const ey=.02*RY/.26;   // 耳当て（図のとおり耳の位置）: 四角い板か、楕円の板＋中の暗い通気口
    for(const sd of[-1,1]){if(helm.ear==='box'){addg(new THREE.BoxGeometry(.03,.085,.06),hm2,sd*(RX+.008),ey,-.012);addg(new THREE.BoxGeometry(.034,.05,.034),und,sd*(RX+.012),ey,-.012)}
      else{const g1=new THREE.CylinderGeometry(1,1,1,12);g1.rotateZ(Math.PI/2);g1.scale(.03,.055,.045);addg(g1,hm2,sd*(RX+.008),ey,-.012);const g2=new THREE.CylinderGeometry(1,1,1,12);g2.rotateZ(Math.PI/2);g2.scale(.034,.03,.025);addg(g2,und,sd*(RX+.012),ey,-.012)}}
    const cy=-RY*.98,cr=RX/.19;   // 首まわり: 首当て（頭の下の筒と縁の輪）。skirt の時は後ろへ広がる裾（図1の後ろ下の縁）も付く
    const ng=new THREE.CylinderGeometry(.13*cr,.155*cr,.1,10);ng.scale(1,1,1.18);addg(ng,hm2,0,cy,0);flatRing(head,.155*cr*K,(cy-.05)*K,.012*K,brs,1.18);
    if(helm.neck==='skirt'){const sk=new THREE.CylinderGeometry(.17*cr,.29*cr,.1,12,1,true,Math.PI/2,Math.PI);addg(sk,hm2,0,cy-.035,-.015)}
    let top=RY+.02;   // 追加パーツ（頭の飾りの基準 headTop も、いちばん高い部品の上へ上げる）
    if(PT.includes('spike')){const ys=RY*Math.sqrt(1-.09),zs=-.3*RZ;   // 円盤つきの円錐（図1: 頭の上の後ろ寄りに立つ）
      addg(new THREE.CylinderGeometry(.006,.055,.3,8),hm1,0,ys+.15,zs);addg(new THREE.CylinderGeometry(.1,.104,.014,14),hm2,0,ys+.004,zs);addg(new THREE.CylinderGeometry(.082,.086,.012,14),brs,0,ys+.015,zs);top=Math.max(top,ys+.31)}
    if(PT.includes('arch')){const rl=helm.rail;   // 頭の上を前から後ろへ通る帯（図2）。2本線の時は真ん中が溝
      cells((a,ps)=>{const x=Math.abs(RX*Math.cos(ps*D)*Math.sin(a*D));return x<=.03&&(!rl||x>=.009)&&(a<90?ps>=35:ps>=-35)},.026,hm1);top=Math.max(top,RY+.03)}
    if(PT.includes('crest')){const sh=new THREE.Shape(),n=7,tp=.15,lo=[],up=[];   // とさか: 後ろが高い流れる形
      for(let i=0;i<=n;i++){const tt=-.86+1.72*i/n;lo.push([tt*RZ,RY*Math.sqrt(1-tt*tt)-.02])}
      for(let i=n;i>=0;i--){const tt=-.86+1.72*i/n;up.push([tt*RZ*1.04,RY*Math.sqrt(1-tt*tt)+tp*(1-Math.pow(Math.abs(tt),1.8))*(tt<0?1.15:.9)])}
      [...lo,...up].forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));const cg=new THREE.ExtrudeGeometry(sh,{depth:.03,bevelEnabled:false});cg.translate(0,0,-.015);cg.rotateY(-Math.PI/2);addg(cg,gold?brs:pcol,0,0,0);top=Math.max(top,RY+.15)}
    if(PT.includes('horns')){for(const sx of[-1,1]){let px=sx*RX*.94,py=RY*.38,a=.2;   // 角: 3つの筒をつないで、外へ出て上へ反る
        for(let k=0;k<3;k++){const L=.085,r1=.032*(1-k*.3),r2=.032*(1-(k+1)*.3),dx=sx*Math.cos(a),dy=Math.sin(a),cg=new THREE.CylinderGeometry(r2,r1,L,6);cg.rotateZ(Math.atan2(-dx,dy));addg(cg,hm1,px+dx*L/2,py+dy*L/2,0);px+=dx*L;py+=dy*L;a+=.42}}top=Math.max(top,RY*.38+.3)}
    if(PT.includes('fan')){   // 後ろの大きな扇形のアーチ（図: 頭の後ろから上へ弧を描く外の帯＋内の帯。間に放射状の骨、頭から内の帯へ横・縦の支え）。弧は縦（前後・上下の面）で、左右にうすい
      const cz=-.04,cy2=RY*.12,A0=-12*D,A1=95*D,ar=(r0,r1,th,fn)=>{const sh=new THREE.Shape(),n=16;for(let i=0;i<=n;i++){const ph=A0+(A1-A0)*i/n,x=cz-r1*Math.sin(ph),y=cy2+r1*Math.cos(ph);i?sh.lineTo(x,y):sh.moveTo(x,y)}
        for(let i=n;i>=0;i--){const ph=A0+(A1-A0)*i/n;sh.lineTo(cz-r0*Math.sin(ph),cy2+r0*Math.cos(ph))}
        const g=new THREE.ExtrudeGeometry(sh,{depth:th,bevelEnabled:false});g.translate(0,0,-th/2);g.rotateY(-Math.PI/2);addg(g,fn,0,0,0)},
        rb=Math.max(RY,RZ);
      ar(rb*1.72,rb*1.9,.034,hm1);ar(rb*1.34,rb*1.48,.03,hm2);   // 外の帯（太い）と内の帯
      for(const[ph,th2]of[[8,.012],[24,.012],[40,.012],[56,.012],[72,.012]]){const a2=ph*D,r0=rb*1.46,r1=rb*1.73,bx=new THREE.BoxGeometry(th2*1.6,r1-r0,.014);   // 放射状の骨（内の帯から外の帯へ）
        bx.translate(0,(r0+r1)/2,0);bx.rotateX(-a2);addg(bx,pcol,0,cy2,cz)}
      for(const dy of[.03,-.035]){const L2=rb*1.34-RZ*.9,bx=new THREE.BoxGeometry(.024,.016,L2);bx.translate(0,0,-(RZ*.9+L2/2));addg(bx,hm2,0,RY*.3+dy,0)}   // 頭の後ろから内の帯へ、横の支え2本
      for(const dx of[-.028,.028]){const L2=cy2+rb*1.34-RY*.97,bx=new THREE.BoxGeometry(.016,L2,.016);bx.translate(dx,RY*.97+L2/2,-.02);addg(bx,hm2,0,0,0)}   // 頭の上から内の帯へ、縦の支え2本
      top=Math.max(top,cy2+rb*1.9)}
    headTop=Math.max(headTop,top*K);
  }
  const gm={dispose(){for(const q of geos)q.dispose();eyeGeo.dispose();eyeMat.dispose()}};
  // 体の目印の位置（gkSignature が、腰・胸・襟・足もとに属性の飾りを付ける基準）
  const yy=v=>hipH+(v-hy0)*F.tor*S,LM={waistY:yy(.12),waistR:.2*F.wx*S,chestY:yy(.38),chestZ:(H.chestZ-hz)*F.wz*S+.03,chestW:.15*F.wx*S,collarY:yy(.62),collarY2:yy(.55),collarR:.17*F.wx*S,collarR2:.24*F.wx*S,hemY:hipH,hemR:.26*F.wx*S,orbR:Math.max(.75,.38*F.wx*S+.3)};
  if(RB){LM.chestZ=Math.max(LM.chestZ,RB.zC+.03);LM.waistR=Math.max(LM.waistR,RB.rW+.03);LM.collarR=Math.max(LM.collarR,RB.rN+.03);LM.collarR2=Math.max(LM.collarR2,RB.rN+.06);LM.hemY=RB.yH;LM.hemR=RB.rH+.03;LM.orbR=Math.max(LM.orbR,RB.rH+.2)}   // 装飾がローブの下に埋まらないよう、目印の位置をローブの表面へ
  LM.bandY0=LM.collarY2-.15;LM.bandY1=LM.waistY;
  const GT=robed&&robed!=='suit'?Object.assign({},GKH.GAIT[frame]||GKH.GAIT.robe,{sw:RK.SW,kn:RK.KN,out:.01}):(GKH.GAIT[frame]||GKH.GAIT.robe);   // ローブの時は脚の振りを小さく（すそから脚が突き出ないように）
  return{g,body,leanNode:body,by:body.position.y,pose:null,gait:GT,frame:frame==='robe'?null:frame,prof:null,ts:F.wx,extraH:0,hyMid:(headY+headTop)/2,hk,legs:legArr,arms,fists,head,headY,eyes,mat,gm,recolor,hatless:true,headShape:hsh,headTop,mesh:new THREE.Object3D(),swH:swHold||swHA[0],swB:swBlade||swBA[0],swH2:swHold2||swHA[1],swB2:swBlade2||swBA[1],swH3:swHA[2],swB3:swBA[2],swH4:swHA[3],swB4:swBA[3],shd:shdG,lm:LM};
}
// ---------- ③ 攻撃方法の見た目: 光が集まる位置（c.gkLightA）と杖。素手=頭上 / 杖=杖の先 / 剣=剣先 ----------
function gkStyleBuild(c,G,st){
  if(!G||!G.fists)return;
  if(st==='bare'){if(G.head){const a=new THREE.Object3D();a.position.set(0,(G.headTop||.34)+.7,0);G.head.add(a);c.gkLightA=a}}
  else if(st==='staff'&&G.fists[0]){
    const wood=new THREE.MeshStandardMaterial({color:0x4a3626,roughness:1,flatShading:true}),gold=new THREE.MeshStandardMaterial({color:0xc9a24a,roughness:.8,metalness:.2,flatShading:true}),geos=[];
    const sh=new THREE.CylinderGeometry(.05,.065,3.2,6);sh.translate(0,1.0,0);   // 手のひらの位置から下に0.6・上に2.6の杖
    const hd=new THREE.OctahedronGeometry(.17,0);hd.translate(0,2.78,0);
    const rg=new THREE.TorusGeometry(.2,.035,5,8);rg.rotateX(Math.PI/2);rg.translate(0,2.52,0);
    const hold=new THREE.Group();geos.push(sh,hd,rg);
    for(const[g,m]of[[sh,wood],[hd,gold],[rg,gold]]){const me=new THREE.Mesh(g,m);me.castShadow=true;hold.add(me)}
    G.fists[0].add(hold);c.gkStaff=hold;
    const tip=new THREE.Object3D();tip.position.set(0,2.9,0);hold.add(tip);c.gkLightA=tip;
    const od=G.gm.dispose;G.gm.dispose=function(){od.call(this);for(const g of geos)g.dispose();wood.dispose();gold.dispose()};   // 杖の部品も、消える時に片づける
  }else if(st==='great'&&G.swB){const a=new THREE.Object3D();a.position.set(0,1.4,0);G.swB.add(a);c.gkLightA=a;   // 大剣の切っ先の近く（光が集まる位置）
  }else if(st==='axe'&&G.swB){const a=new THREE.Object3D();a.position.set(0,1.55,0);G.swB.add(a);c.gkLightA=a;   // 斧の頭の中心（光が集まる位置）
  }else if(st==='spear'&&G.swB){const a=new THREE.Object3D();a.position.set(0,1.98,0);G.swB.add(a);c.gkLightA=a;   // 槍の穂先（光が集まる位置）
  }else if((st==='sword'||st==='dual'||st==='quad')&&G.swB&&((typeof creGkSword!=='undefined'&&creGkSword)||(typeof creSword!=='undefined'&&creSword))){
    const bb=new THREE.Box3().setFromObject((typeof creGkSword!=='undefined'&&creGkSword)||creSword),sz=new THREE.Vector3();bb.getSize(sz);
    const ax=sz.x>=sz.y&&sz.x>=sz.z?'x':sz.y>=sz.z?'y':'z',v=Math.abs(bb.max[ax])>=Math.abs(bb.min[ax])?bb.max[ax]:bb.min[ax];
    const a=new THREE.Object3D();a.position[ax]=v;G.swB.add(a);c.gkLightA=a;   // 剣の長い方向の端（剣先）
  }
}
function gkStylePose(c,dt,q){   // 素手: 手を左右へ広げる / 杖: 杖の腕を上げて溜め、撃つ時に振り下ろす（ほかの腕は下ろしたまま）
  const G=c.G,A=G.arms,w=Math.max(q,c.upQ||0),th=c.armX+.05*Math.sin(c.t*1.6);
  if(c.gkStyle==='dual'||c.gkStyle==='quad'){   // 双剣型: 両手（0・1番）の剣は soldierPose / mageStep が動かす。下の腕（4本の時）は下ろしたまま。四刀流は下の2本も剣を持つので動かさない
    for(let i=c.gkStyle==='quad'?4:2;i<A.length;i++){const s=(i%2)?1:-1,rz0=A[i].userData.rz0===undefined?.18:A[i].userData.rz0;A[i].rotation.x+=(th-A[i].rotation.x)*w;A[i].rotation.z+=(s*rz0-A[i].rotation.z)*w}
    return}
  if(c.gkStyle==='axe'||c.gkStyle==='great'){   // 戦闘斧型・大剣型: 斧を持つ腕（0番）は soldierPose が動かす。ほかの腕は下ろしたまま（大剣型の左腕=1番は両手持ちで gkTwoHand が動かす）
    for(let i=c.gkStyle==='great'?2:1;i<A.length;i++){const s=(i%2)?1:-1,rz0=A[i].userData.rz0===undefined?.18:A[i].userData.rz0;A[i].rotation.x+=(th-A[i].rotation.x)*w;A[i].rotation.z+=(s*rz0-A[i].rotation.z)*w}
    return}
  if(c.gkStyle==='spear'){   // 槍型: 槍を持つ腕（0番）は soldierPose が動かす。魔法を撃つ瞬間・槍を飛ばす瞬間に「突き上げ」を始める。ほかの腕は下ろしたまま
    if(c.bShot&&!c.gkPS&&!c.gkSwing){c.gkSwing=true;c.gkSwU=0}c.gkPS=!!c.bShot;
    if(c.spT>=0&&c.spAtk&&c.spAtk.atk==='spears'&&c.spT>=c.gkCH+GKA.SP.HOLD&&!c.gkSpS&&!c.gkSwing){c.gkSpS=true;c.gkSwing=true;c.gkSwU=0}if(c.spT<0)c.gkSpS=false;
    if(c.gkSwing)c.gkSwU=Math.min(1,(c.gkSwU||0)+dt/(GKA.SWING*.7));
    if(w<.05){c.gkSwing=false;c.gkSwU=0}
    for(let i=1;i<A.length;i++){const s=(i%2)?1:-1,rz0=A[i].userData.rz0===undefined?.18:A[i].userData.rz0;A[i].rotation.x+=(th-A[i].rotation.x)*w;A[i].rotation.z+=(s*rz0-A[i].rotation.z)*w}
    return}
  if(c.gkStyle==='sword'){   // 剣型: 剣を持つ腕（0番）だけで剣を掲げる（姿勢は soldierPose の SSW_HOLD）。ほかの腕は下ろしたまま
    for(let i=1;i<A.length;i++){const s=(i%2)?1:-1,rz0=A[i].userData.rz0===undefined?.18:A[i].userData.rz0;A[i].rotation.x+=(th-A[i].rotation.x)*w;A[i].rotation.z+=(s*rz0-A[i].rotation.z)*w}
    return}
  if(c.gkStyle==='bare'){
    for(let i=0;i<A.length;i++){const s=(i%2)?1:-1;
      A[i].rotation.x+=((-.25+.06*Math.sin(c.t*5+i))-A[i].rotation.x)*w;
      A[i].rotation.z+=(s*(i>=2?1.5:1.95)-A[i].rotation.z)*w}
    return}
  if(c.bShot&&!c.gkPS&&!c.gkSwing){c.gkSwing=true;c.gkSwU=0}c.gkPS=!!c.bShot;   // 普通の魔法を撃った瞬間に振り下ろす
  if(c.spT>=0&&c.spAtk&&c.spAtk.atk==='spears'&&c.spT>=c.gkCH+GKA.SP.HOLD&&!c.gkSpS&&!c.gkSwing){c.gkSpS=true;c.gkSwing=true;c.gkSwU=0}if(c.spT<0)c.gkSpS=false;   // 槍は飛ばす瞬間
  if(c.gkSwing)c.gkSwU=Math.min(1,(c.gkSwU||0)+dt/GKA.SWING);
  if(w<.05){c.gkSwing=false;c.gkSwU=0}
  const u=pwSmooth(c.gkSwU||0),a0=A[0];
  for(let i=0;i<A.length;i++){const s=(i%2)?1:-1,rz0=A[i].userData.rz0===undefined?.18:A[i].userData.rz0;
    if(i===0){A[i].rotation.x+=((-2.5+1.8*u)-A[i].rotation.x)*w;A[i].rotation.z+=(s*(rz0+.15)-A[i].rotation.z)*w}
    else{A[i].rotation.x+=(th-A[i].rotation.x)*w;A[i].rotation.z+=(s*rz0-A[i].rotation.z)*w}}
  if(c.gkStaff){const Pt=.12*(1-w)+(-.35+2.45*u)*w;c.gkStaff.rotation.x=Pt-a0.rotation.x}   // 杖は、腕の動きにかかわらず狙った傾きを保つ
}
// ---------- ゲートキーパー: ゲート（石のアーチ・穴）の前に1体立つ番人。魔法人型・調査員型・軍人型のどれかがランダムで出る（作り方は gkRollSpec: 体型→腕の数→攻撃方法→装飾）。魔法は1つだけ決めて、それしか使わない ----------
// 近づくと出て、遠ざかると消える（倒した番人は出し直さない）。持ち場から動かず外を向いて立ち、AGGRO(m)以内に入ると敵対する。ドア型のゲートは、ゲートだと分からない作りなので番人を置かない。
const GK={NEAR:70,FAR:150,AGGRO:14,KINDS:['mage','inspector','soldier']},GKS=new Map();let gkT=0;   // NEAR=近づくと出る距離(m) / FAR=遠ざかると消える距離(m) / AGGRO=この距離に入ると敵対(m。0なら殴られるまで敵対しない) / KINDS=出る種類
function gkPosts(px,pz){                                            // 近くのアーチ・穴の、正面に立つ位置
  const out=[],ix=Math.floor(px/RGC),iz=Math.floor(pz/RGC);
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const c=rgOfCell(ix+a,iz+b);if(!c||(c.ty!=='arch'&&c.ty!=='hole')||Math.hypot(c.x-px,c.z-pz)>GK.NEAR+30)continue;
    const fx=Math.sin(c.yaw),fz=Math.cos(c.yaw),d=c.ty==='hole'?RG_HR+3:7;   // 正面(局所+z)の外へ。アーチは7m・穴はふちの外3m
    out.push({key:'g'+Math.round(c.x)+'_'+Math.round(c.z),x:c.x+fx*d,z:c.z+fz*d,yaw:pwYawTo(fx,fz)});
  }
  return out;
}
function gkTick(dt){
  gkT-=dt;if(gkT>0)return;gkT=1;
  for(const[k,en]of GKS){const c=en.c;if(!c)continue;
    if(c.dead!==undefined||c.hp<=0){en.dead=true;continue}
    if(!creatures.includes(c)){en.c=null;continue}
    if(Math.hypot(c.hx-player.x,c.hz-player.z)>GK.FAR&&!c.hostile){guardRemove(c);en.c=null}}
  for(const po of gkPosts(player.x,player.z)){
    if(Math.hypot(po.x-player.x,po.z-player.z)>GK.NEAR)continue;
    let en=GKS.get(po.key);if(!en){en={c:null,dead:false};GKS.set(po.key,en)}
    if(en.dead||en.c)continue;
    spawnMage({x:po.x,z:po.z,yaw:po.yaw,entry:en,gk:true});   // 体型・腕の数・攻撃方法まで、gkRollSpec が順に決める
  }
}
// ---------- ゲートキーパーの追加属性の攻撃 ----------
// 第二属性以降の「追加属性」ごとに、攻撃の種類を GKA.TYPES から1つ抽選して持たせる（spawnMage の gkExtra）。今は攻撃が「槍」だけなので、第二属性が付いたら必ず槍になる。
// 攻撃する時は、持っている追加属性のうち1つをランダムに選び、その属性の攻撃をその属性の色で出す。追加属性を持つ番人は、自分の魔法・剣は使わず、この攻撃だけをする。
// 攻撃を増やす時: GKA.TYPES に名前を足し、gkAtkStart / gkAtkStep に分岐を足す（槍は gkSpearSummon / gkSpearStep / gkSpearTick）。
const GKA={SHAPE:{DEPTH:.66,SHOULDER:1.22,DEPTH_SOLDIER:.82,SHOULDER_SOLDIER:1.1},/* SHAPE=ゲートキーパーの体型（人型のシルエット）: DEPTH=胴の前後の厚みの倍率（小さいほど薄い。1で元の丸い体）/ SHOULDER=肩まわりの横幅の倍率（1で変えない）/ _SOLDIER=軍人用（鎧がもともと肩幅広いので控えめ） */TYPES:['spears','erupt','tornado','nova','flip','vortex','blink','fan','chain','halo','frenzy','blizzard','cwave','drill','summon','hurl'],RANGE:18,FAR:5,RNG:{spears:'long',erupt:'long',tornado:'long',nova:'short',flip:'long',vortex:'short',blink:'long',fan:'short',chain:'long',halo:'long',frenzy:'any',blizzard:'any',cwave:'any',drill:'long',summon:'any',hurl:'long'},WAIT:[1.8,1.4],WAITK:.6,   // RANGE=この距離より近ければ攻撃する(m) / FAR=これ以上離れていたら「遠い」・近ければ「近い」(m。軍人の剣は近い時、調査員の魔法と槍は遠い時に撃つ) / RNG=追加属性の攻撃の種類ごとの撃つ距離 / WAIT=追加属性の攻撃のあと、次の攻撃までの秒数 [最短, 幅] / WAITK=ゲートキーパーの普通の攻撃の待ち時間にかける倍率（小さいほど間隔が短い）
  SP:{N:10,SUMMON:1.3,HOLD:.5,SPEED:26,LIFE:2.2,LEN:2.1,DMGK:.35,HITR:.6,W:2.4,HR:2.6,H0:2.0}};   // 槍: H0=頭上の高さ(体の大きさ倍) / BACK=後ろへずらす量 / N=本数 / SUMMON=頭上に出して狙う秒数 / HOLD=狙いを固めてから飛ばすまでの秒数（この間に動けばよけられる） / SPEED=飛ぶ速さ(m/秒) / DMGK=1本のダメージ（火のビームの威力に対する倍率） / HITR=当たる半径(m) / W=左右のばらつき幅 / HR=高さのばらつき幅 / H0=浮かぶ高さの下限（体の大きさ倍。頭は約1.75）
GKA.ER={TRACK:.7,LOCK:.6,R:1.8,DMGK:1.5,DUR:.7};   // 足元から噴き出す攻撃: TRACK=足元の印がプレイヤーを追う秒数 / LOCK=印を固めてから噴き出すまでの秒数（この間に動けばよけられる） / R=当たる半径(m) / DMGK=ダメージ（火のビームの威力に対する倍率。結晶は創造の魔法と同じダメージ） / DUR=炎・雷が出ている秒数
const GKA_COL={fire:0xff6a14,thunder:0x5f8fff,ice:0x9fdcff,water:0x2f6fe8,dark:0x2a1040,a:0xffe45a,b:0x3de0c0,c:0xc040ff,d:0x3a9bff,e:0xe01818};   // 属性ごとの色（槍・噴き出し・竜巻・燃える輪・宙返り）。プレイヤーの各魔法のLv1の色と同じ: 火=ビームの外側 / 雷・氷・水=それぞれの魔法 / 闇=黒紫 / a=ブラスト / b=コントロール / c=支配 / d=クリエイション / e=爆破
const gkBl=col=>col===GKA_COL.dark?THREE.NormalBlending:THREE.AdditiveBlending;   // 闇は黒いので、加算だと見えなくなる。プレイヤーの闇と同じく通常の重ね方にする
const gkSp=[],gkSpMatC=new Map();let gkSpGeo=null;
// ---------- 剣タイプのキーパーの個性（1体ごとに1つ）: 切る=横振り中心 / 叩きつける=叩きつけ中心 / 投げる=遠くから剣を投げる（戻るまで剣は振れない）/ 近づいたら攻撃=追わずに待ち、間合いに入られたら素早く振る / 近づきながら攻撃=振っている間も前へ歩く / 攻撃で近づく=遠めから大きく踏み込んで振る / 遠くから攻撃=近づかれたら下がり、斬撃波を飛ばす ----------
const gkSw=[],gkSwGone=new Set();let gkSwWaveG=null;
const GKSW={P:['slash','smash','thrower','ambush','advance','lunge','far'],START_ADV:5.2,START_LUNGE:5.8,LUNGE_K:2.6,AMB:2.6,KEEP:6.5,THROW:{R:16,SPD:20,CD:3.5,DMG:.9,BACK:1.4},WAVE:{R:15,SPD:15,CD:2.2,DMG:.6}};   // START_ADV・START_LUNGE=振り始める距離(m) / LUNGE_K=踏み込みの倍率 / AMB=近づいたら攻撃で待つ距離（剣の届く距離の倍率） / KEEP=遠くから攻撃で保つ最短距離 / THROW・WAVE: R=届く距離 SPD=飛ぶ速さ(m/s) CD=次に撃てるまで(秒) DMG=ダメージ(剣の攻撃力に対する倍率) BACK=投げた剣が戻るまで(秒)
function gkPickSwP(){return GKSW.P[Math.floor(Math.random()*GKSW.P.length)]}
function gkSwExtra(c){return c.gkSwP==='thrower'?[{id:'normal',kind:'throw',rng:'long'}]:c.gkSwP==='far'?[{id:'normal',kind:'wave',rng:'any'}]:[]}
function gkSwPickAtk(c,cand){   // 切る・叩きつける: 好みの振り方を8割で選ぶ
  if(c.gkSwP==='slash'||c.gkSwP==='smash'){const pf=cand.filter(a=>a.id==='normal'&&(c.gkSwP==='slash'?a.kind==='side':(a.kind==='down'||a.kind==='flip')));if(pf.length&&Math.random()<.8)return pf[Math.floor(Math.random()*pf.length)]}
  return cand[Math.floor(Math.random()*cand.length)]}
function gkSwFire(c){   // 振りの途中で、剣を投げる（回りながら飛ぶ）/ 斬撃波を飛ばす（弧の形の光）
  const G=c.G,k=c.swRanged;if(!G||!G.swB||STAT.dead)return;
  const el=sswElem(c),col=GKA_COL[el]||0xffffff,sz=Math.max(.9,c.size||1),T=new THREE.Vector3(player.x,player.y-.7,player.z);
  c.g.updateMatrixWorld(true);const wp=new THREE.Vector3(),wq=new THREE.Quaternion(),ws=new THREE.Vector3();G.swB.matrixWorld.decompose(wp,wq,ws);
  if(k==='throw'){
    if(c.swGoneT>0)return;
    let m;
    if(c.gkAxe){const hp=new THREE.Vector3(0,1.55,0);G.swB.localToWorld(hp);wp.copy(hp);   // 斧: 頭の中心を回転の中心にする（柄の端で回すと不自然）。中身は頭が原点になるようにずらして入れる
      const a=G.swB.clone();a.visible=true;a.rotation.set(0,0,0);a.quaternion.identity();a.scale.copy(ws);a.position.set(0,-1.55*ws.y,0);m=new THREE.Group();m.add(a);m.position.copy(wp);scene.add(m)}
    else{m=G.swB.clone();m.visible=true;m.position.copy(wp);m.quaternion.copy(wq);m.scale.copy(ws);scene.add(m)}
    G.swB.visible=false;c.swGoneT=GKSW.THROW.BACK;gkSwGone.add(c);c.swThrowCD=c.t+GKSW.THROW.CD;
    const dir=T.clone().sub(wp);if(dir.lengthSq()<1e-4)dir.set(0,0,1);dir.normalize();
    if(c.gkAxe){const zA=new THREE.Vector3(dir.z,0,-dir.x);if(zA.lengthSq()>1e-6){zA.normalize();const xA=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),zA).normalize(),yA=new THREE.Vector3().crossVectors(zA,xA);m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,yA,zA))}}   // 斧の面（刃を広げた面）を進行方向を含む縦の面に合わせる → 回転軸(ax)まわりに、刃を広げたまま前転して飛ぶ
    gkSw.push({k,c,m,dir,sp:GKSW.THROW.SPD,left:GKSW.THROW.R+4,R0:GKSW.THROW.R+4,el,M:gkFlameMats(col),ax:new THREE.Vector3(dir.z,0,-dir.x).normalize(),dmg:SSW.ATK*GKSW.THROW.DMG*(c.swDmgK||1),rad:1.4,spin:c.gkAxe?28:22});
  }else{
    if(!gkSwWaveG){const g=new THREE.TorusGeometry(1.4,.09,6,24,2.2);g.rotateZ(-1.1);gkSwWaveG={v:g,h:g.clone().rotateX(Math.PI/2)}}   // 弧の中心が +x（進む向き）。h=横の斬撃波（水平） / v=縦の斬撃波（立てる）
    const side=c.swKind==='side',mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),m=new THREE.Mesh(side?gkSwWaveG.h:gkSwWaveG.v,mat);
    const dir=new THREE.Vector3(player.x-c.x,0,player.z-c.z);if(dir.lengthSq()<1e-4)dir.set(Math.sin(c.yaw-PEASANT_FLIP),0,Math.cos(c.yaw-PEASANT_FLIP));dir.normalize();
    m.position.set(c.x+dir.x*1.4,Math.max(c.y+.9*sz,Math.min(c.y+2.2*sz,T.y)),c.z+dir.z*1.4);m.rotation.y=Math.atan2(-dir.z,dir.x);m.scale.setScalar(sz);scene.add(m);
    c.swWaveCD=c.t+GKSW.WAVE.CD;
    gkSw.push({k,c,m,mat,dir,sp:GKSW.WAVE.SPD,left:GKSW.WAVE.R,R0:GKSW.WAVE.R,el,M:gkFlameMats(col),dmg:SSW.ATK*GKSW.WAVE.DMG*(c.swDmgK||1),rad:1.9*sz});
  }
}
Object.assign(GKSW,{HALO:{N:[3,5],SP:22,DMG:.5,CD:1.2,MAX:8,STAG:.13,WAIT:.35}});   // 後輪の剣: N=1回の攻撃で飛ぶ本数[最少,最多] / SP=飛ぶ速さ(m/s) / DMG=1本のダメージ(剣の攻撃力に対する倍率) / CD=次の一斉射までの秒 / MAX=同時に出ている最大本数 / STAG=1本ずつの時間差 / WAIT=輪のまわりで構えている秒
let gkSwSwordG=null;const gkSwMatC=new Map(),_swV=new THREE.Vector3(),_swT=new THREE.Vector3(),_swY=new THREE.Vector3(0,1,0);
function gkSwSwordMesh(col){   // 飛ぶ剣（十字の形: 刃・切っ先・鍔・柄）。形と材質は使い回し
  if(!gkSwSwordG){const tp=new THREE.ConeGeometry(.0707,.28,4);tp.rotateY(Math.PI/4);tp.translate(0,.575+.14,0);gkSwSwordG={b:new THREE.BoxGeometry(.1,1.15,.035),t:tp,g:new THREE.BoxGeometry(.5,.07,.06),h:new THREE.BoxGeometry(.06,.35,.05),p:new THREE.SphereGeometry(.05,6,4)}}
  let M=gkSwMatC.get(col);if(!M){M={a:new THREE.MeshBasicMaterial({color:col}),b:new THREE.MeshBasicMaterial({color:new THREE.Color(col).lerp(new THREE.Color(0xffffff),.55)})};gkSwMatC.set(col,M)}
  const g=new THREE.Group(),B=gkSwSwordG,add=(geo,mat,y)=>{const m=new THREE.Mesh(geo,mat);m.position.y=y;g.add(m)};
  add(B.b,M.b,0);add(B.t,M.b,0);add(B.g,M.a,-.45);add(B.h,M.a,-.68);add(B.p,M.a,-.88);return g;
}
function gkHaloVolley(c){   // 攻撃を始めるたびに、後輪から剣が数本出る（輪のまわりで相手へ向いて待ち、時間差で飛ぶ）。当たると物理ダメージ＋その剣の属性の追加効果
  const H=c&&c.gkSwHalo;if(!H||STAT.dead||c.hp<=0||c.t<(c.gkVolleyCD||0))return;
  let cur=0;for(const s of gkSw)if(s.c===c&&s.k==='halo')cur++;if(cur>=GKSW.HALO.MAX)return;
  c.gkVolleyCD=c.t+GKSW.HALO.CD;const P=GKSW.HALO,n=P.N[0]+Math.floor(Math.random()*(P.N[1]-P.N[0]+1)),sz=Math.max(.9,c.size||1),col=GKA_COL[H.el]||0xdde8ff,a0=Math.random()*6.283;
  for(let i=0;i<n;i++){const a=a0+i/n*6.283,m=gkSwSwordMesh(col);m.scale.setScalar(.9*sz);m.position.copy(H.g.getWorldPosition(_swV));scene.add(m);
    gkSw.push({k:'halo',c,m,dir:new THREE.Vector3(0,0,1),sp:P.SP,left:34,R0:34,el:H.el,M:gkFlameMats(col),dmg:SSW.ATK*P.DMG*(c.swDmgK||1),rad:.95,wait:P.WAIT+i*P.STAG,sx:Math.cos(a)*H.r,sy:Math.sin(a)*H.r})}
  try{castSnd('fireCastSample',.5,c.x,c.z)}catch(e){}
}
function gkSwTick(dt){
  if(gkSwGone.size){for(const c of gkSwGone){c.swGoneT-=dt;if(c.swGoneT<=0||c.hp<=0||c.dead!==undefined){c.swGoneT=0;if(c.G&&c.G.swB)c.G.swB.visible=true;gkSwGone.delete(c)}}}   // 投げた剣が手に戻る
  for(let n=gkSw.length-1;n>=0;n--){
    const s=gkSw[n],m=s.m,c=s.c,R=Math.random;
    if(s.wait>0){   // 後輪の剣: 輪のまわりで相手へ向きを合わせて待つ → 時間になったら、その向きへ飛ぶ
      const H=c.gkSwHalo;
      if(!H||c.hp<=0||c.dead!==undefined||STAT.dead){scene.remove(m);gkSw.splice(n,1);continue}
      H.g.localToWorld(_swV.set(s.sx,s.sy,0));m.position.copy(_swV);
      _swT.set(player.x,player.y-.7,player.z).sub(m.position);if(_swT.lengthSq()<1e-4)_swT.set(0,0,1);_swT.normalize();m.quaternion.setFromUnitVectors(_swY,_swT);
      s.wait-=dt;if(s.wait<=0)s.dir.copy(_swT);
      continue}
    const step=s.sp*dt;
    m.position.addScaledVector(s.dir,step);s.left-=step;
    if(s.k==='throw')m.rotateOnWorldAxis(s.ax,dt*(s.spin||22));else if(s.k==='wave')s.mat.opacity=.85*Math.min(1,s.left/3+.2);
    try{gkPart(s.el,m.position.x+(R()-.5)*.4,m.position.y+(R()-.5)*.4,m.position.z+(R()-.5)*.4,R()-.5,R()-.5,R()-.5,.25,.12,s.M)}catch(e){}
    let done=s.left<=0||(s.R0-s.left>1.5&&solidAt(m.position.x,m.position.y,m.position.z));
    if(!done&&!STAT.dead){const dx=player.x-m.position.x,dz=player.z-m.position.z,dy=(player.y-.7)-m.position.y;if(dx*dx+dz*dz<s.rad*s.rad&&Math.abs(dy)<1.4){playerPhys(s.dmg,c);if(s.k==='halo'){if(!shieldAbsorb(0))gkElemHit(s.el,c)}else soldierElem(c);done=true}}
    if(done){scene.remove(m);if(s.mat)s.mat.dispose();gkSw.splice(n,1)}
  }
}
function gkFirstTrait(c,nativeEl){                                   // 番人の通常攻撃が当たった時、第一属性の特性（火傷・凍傷・マナ上昇・即死など）を付ける。攻撃そのものがその属性（nativeEl）なら、もともとの効果があるので足さない
  if(!c||!c.gk||!c.gkFirst||STAT.dead)return;
  // 闇は通常攻撃が闇属性でも即死を適用。爆破属性の通常攻撃自体には既に爆発があるため二重発生させない。
  if(c.gkFirst===nativeEl&&(nativeEl==='fire'||nativeEl==='ice'||nativeEl==='water'||nativeEl==='thunder'))return;   // 火・氷・水・雷はその攻撃自体に効果がある（二重にしない）。闇・支配・創造・爆破などは通常攻撃が当たった時にここで効果が付く
  if(!shieldAbsorb(0))gkElemHit(c.gkFirst,c);
}
function gkElemHit(el,c){                                            // 番人の追加属性の攻撃を受けた時の追加効果（攻撃の種類に関わらず、属性で決まる）: 火=火傷 / 氷=凍結＋凍傷 / 水=マナ上昇 / 闇=即死 / 支配=体力(スタミナ)が半分 / 爆破=当たった場所で追加の爆発。光のシールドが受け止めた時・魔法が効かない時は何も起きない
  if(STAT.dead||SHIELD.blk||playerManaPass()<=0)return;
  if(el==='fire')applyPlayerBurn(enemyPower(c)*(c.dmgK===undefined?1:c.dmgK));
  else if(el==='ice'){const pw=enemyPower(c)*(c.dmgK===undefined?1:c.dmgK);STAT.frozenT=Math.min(ICE.MAX,Math.max(STAT.frozenT||0,Math.min(ICE.MAX,ICE.CRE_TIME*pw)));iceEl.style.opacity=1;applyPlayerFrostbite()}   // 氷: 凍傷に加えて、氷のビームと同じく体が凍って動けなくなる（時間は番人の魔力で決まる）
  else if(el==='water'){const mx=MAGIC.MAXLV,lv=Math.min(mx,Math.max(1,MAGIC.lv('water')));STAT.manaK=1.1+.9*(lv-1)/(mx-1);STAT.manaT=FNOVA.BUFF_T;if(typeof gameToast==='function')gameToast('水をあびてマナが ×'+STAT.manaK.toFixed(1)+' に上がった（'+FNOVA.BUFF_T+'秒）')}   // 自分の水の長押しと同じマナ上昇
  else if(el==='dark')killPlayer();
  else if(el==='e'){                                                 // 爆破: 当たった場所で追加の爆発（爆破の魔法と同じ見た目）。爆風でダメージを受けて、番人と反対へ吹き飛ぶ
    const x=player.x,y=player.y-.7,z=player.z;hcBoomFx(x,y,z,HCTRL.EXP_R);shakeT=.4;shakeA=.12;
    let hx=player.x-c.x,hz=player.z-c.z,hd=Math.hypot(hx,hz);if(hd<1e-3){hx=Math.sin(player.yaw);hz=Math.cos(player.yaw);hd=1}
    playerMagic(HCTRL.PL_DMG*enemyPower(c)*(c.dmgK===undefined?1:c.dmgK));
    if(!STAT.dead){player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=Math.max(player.kbv||0,CREA.KB_PL*.8);
      if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*.8}else player.vy=Math.max(player.vy,CREA.KB_PLUP*.8)}}
  else if(el==='d'){spawnCreaRock(player.x,player.z,1,player.gy+.3)}   // 創造: 足元に結晶が立つ（せり上がって突き上げる）
  else if(el==='c'){STAT.sta=Math.floor(STAT.sta/2);if(STAT.staHold!==undefined)STAT.staHold=Math.min(STAT.staHold,STAT.sta);if(typeof gameToast==='function')gameToast('支配されて体力が半分になった')}   // 支配: プレイヤーの体力（スタミナ。HPではない）が半分に減る
}
function gkAtkRange(c,a){const rr=gkAtkRange0(c,a);if(a.kind==='dash')return MV.DASH.R;if(a.kind==='leap')return MV.LEAP.R;if(a.kind==='throw')return GKSW.THROW.R;if(a.kind==='wave')return GKSW.WAVE.R;if(c.gkSwP&&a.id==='normal'&&c.soldier&&a.kind!=='spell'){if(c.gkSwP==='advance')return GKSW.START_ADV;if(c.gkSwP==='lunge')return GKSW.START_LUNGE}return rr}   // 剣の個性: 近づきながら攻撃・攻撃で近づく は、遠めから振り始める / 剣を投げる・斬撃波は遠距離
function gkAtkRange0(c,a){return a.id==='extra'?(a.ex&&a.ex.atk==='summon'?GKA.SM.RANGE:GKA.RANGE):(c.soldier&&a.kind!=='spell')?(c.gkAxe?gswK(c).START:c.gkSpear?SPR.START:(c.gkDual||c.gkQuad)?DW.START:SSW.START):MAGE.RANGE}   // その攻撃が届く距離(m)
function gkRangeInfo(c){                                              // 番人ごとの射程のまとめ（lm=遠くから撃てる攻撃の最大射程 / mx=全攻撃の最大射程）。毎フレーム配列を作らないよう、設定値が変わらない限り使い回す
  let I=c.gkRI;const a=GKA.RANGE,b=SSW.START,d=MAGE.RANGE;
  if(!I||I.a!==a||I.b!==b||I.d!==d){let lm=0,mx=0;for(const t of c.gkAtks){const r=gkAtkRange(c,t);t.r=r;if(r>mx)mx=r;if(t.rng==='long'&&r>lm)lm=r}I=c.gkRI={lm,mx,a,b,d}}
  return I;
}
const _gkCandBuf=[];                                                  // gkCand の結果を入れる使い回しの配列（毎フレーム新しく作らない）
function gkCand(c,zd,df,cls){                                         // いま撃てる攻撃の一覧。cls=近い('short')か遠い('long')か（省略=距離を問わない）。返す配列は次の gkCand 呼び出しで上書きされる
  const out=_gkCandBuf;out.length=0;gkRangeInfo(c);
  if(Math.abs(df)>=.5)return out;
  for(const a of c.gkAtks){
    if(cls&&a.rng!=='any'&&a.rng!==cls)continue;
    if(zd>=a.r)continue;
    if(a.min&&zd<a.min)continue;   // 突進・跳躍は近すぎると出さない
    if(a.id==='normal'){if(a.kind==='throw'){if(c.t<(c.swThrowCD||0)||c.swGoneT>0)continue}else if(a.kind==='wave'){if(c.t<(c.swWaveCD||0))continue}else if(c.swGoneT>0&&a.kind!=='spell')continue}   // 剣を投げた直後は剣が戻るまで振れない / 投げる・斬撃波は連発しない
    if(a.id==='extra'&&a.ex.atk==='summon'&&(c.t<(c.smNext||0)||gkSummonCount(c)>=GKA.SM.MAX))continue;   // 部下の召喚: 次に呼べるまでの待ち時間中、部下がもう最大数いる時は撃たない
    if(a.id==='extra'){if(c.spWait>0)continue}
    else if(c.soldier&&a.kind!=='spell'){if(c.swWait>0)continue}   // 剣の攻撃は剣の待ち時間 / 魔法（kind='spell'）は魔法の待ち時間
    else if(c.bWait>0)continue;
    out.push(a)}
  return out;
}
function gkAI(c,dt,face,zd){                                          // ゲートキーパーの毎フレームの動き（敵対中）。歩いた速さを返す
  if(c.spT>=0){if(c.spPre>0){c.spPre-=dt;face(.6);c.aim={x:player.x,y:player.y-.7,z:player.z};if(c.spPre<=0){c.spPre=0;c.gkSwing=true;c.gkSwU=0;gkAtkStart(c,c.spAtk)}return 0}   // 溜めの間（攻撃方法ごとの時間）: 光を集める。溜め終わったら攻撃を始める
    if((c.spT<(c.gkCH||GKA.SP.SUMMON)||c.spAtk.atk==='halo'||c.spAtk.atk==='frenzy')&&!(c.fl&&c.fl.ph!=='wind')&&!(c.dr&&c.dr.ph!=='wind'))face(.6);gkAtkStep(c,dt);return c.fzSpeed||0}   // 槍を出している間は相手を追って狙う。狙いを固めたあとは向きも固定
  if(c.swT>=0){if(c.gkSwP==='advance'&&!c.fz&&zd>2.4){c.tx=player.x;c.tz=player.z;return golemWalk(c,dt,MAGE.CHASE*c.spdK*.8)}return 0}   // 近づきながら攻撃: 振っている間も前へ歩く / それ以外は振っている間は動かない                                              // 軍人が剣を振っている間は動かない
  if(c.shield){   // 盾持ち: 盾を前に出している間は動かず相手の方を向く（時間は gkShieldStep が数える）。出し終えたらしばらく出さない（出すタイミングは毎回ランダム）
    if(c.shOn){face(.9);return 0}
    c.shCD=(c.shCD===undefined?SHD.CD[0]*Math.random():c.shCD)-dt;
    if(zd<(c.shSmall?SHD.SM_RANGE:SHD.RANGE)){   // プレイヤーの攻撃に合わせて構える（反射＋予測。どちらも外れることがある）
      const now=performance.now()/1000;
      if(c.shSeen===undefined)c.shSeen=PTH.n;                       // 戦い始める前の攻撃には反応しない
      if(c.shSeen!==PTH.n){c.shSeen=PTH.n;gkShieldPlan(c,now)}      // プレイヤーが新しく攻撃した: 気づいたら、構える時刻を決める
      if(c.shAt>0&&now>=c.shAt){const late=now-c.shAt;c.shAt=0;
        if(late<SHR.STALE&&c.shCD<=0){c.shOn=true;c.shTm=SHD.ON[0]+Math.random()*SHD.ON[1];if(c.shSmall){c.bkT=0;c.bkSnd=false}return 0}}}}   // 構える時刻になった時に、まだクールタイム中・別の動作で遅れすぎていたら構えない
  const df=face(.8);if(c.spWait>0)c.spWait-=dt;if(c.soldier&&c.swWait>0)c.swWait-=dt;
  if(c.gkCombo){c.gkCombo=false;if(!STAT.dead){const nc=gkCand(c,zd,df).filter(a=>a.id==='normal');if(nc.length){gkNormalStart(c,nc[Math.floor(Math.random()*nc.length)].kind);return 0}}}   // 雷の瞬間移動のあと: 距離を問わず、すぐ通常攻撃（軍人なら剣を振る）
  const cls=zd<GKA.FAR?'short':'long';
  let cand=gkCand(c,zd,df,cls);
  if(!cand.length){                                                  // 撃てる攻撃が無い: 距離を取る・詰める
    if(c.soldier){
      if(c.gkSwP==='far'){if(zd<GKSW.KEEP){const sp=mageBack(c,dt);if(sp>0)return sp}if(zd<=GKSW.WAVE.R*.85)return 0}   // 遠くから攻撃: 近づかれたら下がり、斬撃波が届く距離なら待つ
      if(c.gkSwP==='ambush'&&zd<=SSW.START*GKSW.AMB)return 0;   // 近づいたら攻撃: 追わずに待ち、間合いに入られたら素早く振る
      const lm=gkRangeInfo(c).lm;
      if(zd>=GKA.FAR&&lm>0){if(zd>lm*.8){c.tx=player.x;c.tz=player.z;return golemWalk(c,dt,MAGE.CHASE*c.spdK)}}   // 遠くから撃てる攻撃がある軍人は、遠すぎる時だけ近づく
      else if(zd>(c.gkAxe?gswK(c).STOP:c.gkSpear?SPR.STOP:(c.gkDual||c.gkQuad)?DW.STOP:SSW.STOP)){c.tx=player.x;c.tz=player.z;return golemWalk(c,dt,MAGE.CHASE*c.spdK)}
    }else{
      if(zd<(c.inspector?GKA.FAR:MGD.KEEP)){                         // 近すぎる: 相手を向いたまま下がる（調査員は、遠い時に撃つ攻撃しか無いのでより遠くまで下がる）
        const sp=mageBack(c,dt);if(sp>0)return sp;
        cand=gkCand(c,zd,df)}                                        // 下がれない（壁際など）: 距離を問わず撃てる攻撃を撃つ
      else if(zd>gkRangeInfo(c).mx*.8){c.tx=player.x;c.tz=player.z;return golemWalk(c,dt,MAGE.CHASE*c.spdK)}
    }
  }
  if(cand.length){                                                   // 撃てる攻撃の中から、完全にランダム（同じ確率）で選ぶ
    const a=gkSwPickAtk(c,cand);
    if(a.id==='extra')gkExtraBegin(c,a.ex);else gkNormalStart(c,a.kind);
  }
  return 0;
}
// ---------- ゲートキーパーの盾: 左手が空いている剣型・槍型に、確率 SHD.P で付く。ランダムなタイミングで盾を体の前に出し、出している間は正面からの物理・魔法を無効化する（その間は動かず攻撃もしない） ----------
const SHD={P:.4,H:.8,W:.62,CURVE:.9,Y:.52,CD:[3,4.5],ON:[1.5,1.7],RANGE:30,COS:.15,SMALL_P:.5,SM_R:.16,BK:{UP:.25,PARRY:.3,REC:.3},SM_CD:[2.5,3],SM_RANGE:10,KB:1.5,STUN:.7};   // 小盾（SMALL_P=盾が付く時に小盾になる確率 / SM_R=小盾の半径（体の高さに対する割合） / BK=小盾の動き: UP=構える秒（まだ防がない・予告）→ PARRY=弾く秒（この間に当たった攻撃を無効化して跳ね返す）→ REC=戻る秒（無防備） / SM_CD=次に構えるまでの秒 / SM_RANGE=この距離以内の時だけ構える(m) / KB=跳ね返した時にプレイヤーが飛ぶ強さ（やられた時のノックバックに対する倍率） / STUN=跳ね返された時にプレイヤーが動けない秒）
// ↑ 大盾は上の値。   // P=盾が付く確率（剣型・槍型のうち） / H=盾の高さ（体の高さに対する割合） / W=横幅（高さに対する割合） / CURVE=曲がり（rad。大きいほど深く曲がる） / Y=出した時の盾の中心の高さ（体の高さに対する割合） / CD=出し終えてから次に出すまでの秒（最短, 幅） / ON=出している秒（最短, 幅） / RANGE=この距離以内の時だけ出す(m) / COS=正面とみなす範囲（攻撃が来た向きと正面の内積。0.15≒正面から約±81°）
// ---------- 盾を構えるタイミング: プレイヤーの攻撃（剣・素手・杖の振り / 長押しの攻撃魔法）に合わせる。完璧にはしない ----------
const PTH={n:0,t:-99,avg:1,streak:0};   // n=プレイヤーが攻撃した回数 / t=最後に攻撃した時刻(秒) / avg=攻撃の間隔の移動平均(秒) / streak=間隔が短いまま続けて攻撃した回数
const SHR={REACT:[.12,.22],MISS:.3,PRED_P:.6,JIT:.4,STREAK:1,STALE:.6};   // REACT=攻撃に気づいてから構え始めるまでの反応時間(最短, 幅 秒) / MISS=攻撃を見逃す確率（反射が出ない） / PRED_P=攻撃のリズムを読んで先に構える確率（連続で攻撃されている時） / JIT=予測する時刻のずれ（間隔に対する割合。大きいほど外れる） / STREAK=予測を始める連続攻撃の回数 / STALE=構える時刻から何秒以上遅れたら諦めるか
function playerAtkNote(){                                           // プレイヤーが攻撃を始めた（swingAxe・攻撃魔法の長押しから呼ぶ）
  const now=performance.now()/1000,d=now-PTH.t;
  if(d<2.5){PTH.streak++;if(d>.12)PTH.avg=Math.max(.3,Math.min(2,PTH.avg+(d-PTH.avg)*.35))}else PTH.streak=0;
  PTH.t=now;PTH.n++}
function gkShieldPlan(c,now){                                       // 番人がプレイヤーの攻撃に気づいた: いつ盾を構えるか決める（c.shAt。-1=構えない）
  let at=-1;
  if(Math.random()>=SHR.MISS)at=now+SHR.REACT[0]+Math.random()*SHR.REACT[1];   // 反射: 攻撃を見てから、少し遅れて構える（見逃すこともある）
  if(PTH.streak>=SHR.STREAK&&Math.random()<SHR.PRED_P){                         // 予測: 攻撃の間隔から次の攻撃を読んで、当たる頃に間に合うよう先に構える（読みは毎回ずれる）
    const lead=c.shSmall?SHD.BK.UP:.15,nx=Math.max(now+.05,PTH.t+PTH.avg*(1+(Math.random()*2-1)*SHR.JIT)-lead);
    if(at<0||nx<at)at=nx}
  c.shAt=at}
function gkShieldStep(c,G,dt){                                       // 毎フレーム: 盾を出す・しまう時間と、盾と左腕の位置・向きを動かす
  if(!c.shield||!G.shd)return;
  let tgt=0;
  if(c.shSmall){   // 小盾: 構える(UP・まだ防がない) → 弾く(PARRY・この間に当たった攻撃を跳ね返す) → 戻る(REC・無防備)。構え始めは gkAI（c.bkT=0）
    if(c.shOn){c.bkT+=dt;const T=c.bkT,BK=SHD.BK;
      if(!c.hostile||c.hp<=0||T>=BK.UP+BK.PARRY+BK.REC){c.shOn=false;c.shPar=false;c.shCD=SHD.SM_CD[0]+Math.random()*SHD.SM_CD[1]}
      else{c.shPar=T>=BK.UP&&T<BK.UP+BK.PARRY;tgt=T<BK.UP+BK.PARRY?1:0;if(c.shPar&&!c.bkSnd){c.bkSnd=true;if(audioSamples.armorSample)playSample('armorSample',.35)}}}   // 弾く瞬間に金属音
    else c.shPar=false;
    c.shF=(c.shF||0)+((c.shPar?1:0)-(c.shF||0))*Math.min(1,dt*(c.shPar?30:10));   // 弾く動き（盾を前へ突き出す量）
  }else{
    if(c.shOn){c.shTm-=dt;if(c.shTm<=0||!c.hostile||c.hp<=0){c.shOn=false;c.shCD=SHD.CD[0]+Math.random()*SHD.CD[1]}}
    tgt=c.shOn?1:0}
  c.shUp+=(tgt-c.shUp)*Math.min(1,dt*(tgt?(c.shSmall?14:9):(c.shSmall?10:6)));
  const u=c.shUp<.003?0:c.shUp,sd=G.shd.userData;
  G.shd.position.lerpVectors(sd.pLow,sd.pHigh,u);G.shd.quaternion.copy(sd.qLow).slerp(sd.qHigh,u);
  if(sd.small&&c.shF>.001){G.shd.position.y-=.55*c.shF;G.shd.position.x+=.2*c.shF}   // 弾く: 盾を前（腕の先の向き）と少し外へ突き出す
  if(u>0){const A=G.arms[1];A.rotation.x+=(-1.5-A.rotation.x)*u;A.rotation.z+=(0-A.rotation.z)*u
    if(G.swH&&G.arms[0]){const P=SPR_REST,A0=G.arms[0];A0.rotation.x+=(P[0]-A0.rotation.x)*u;A0.rotation.y+=(0-A0.rotation.y)*u;G.swH.rotation.x+=(Math.PI+P[1]-G.swH.rotation.x)*u}}   // 盾を出している間は、右手の剣・槍を立てて持つ（正面へ向けたままだと盾の中を突き抜けるため）。左腕は前へ水平に伸ばす
  if(c.shFl>0){c.shFl-=dt;G.shd.scale.setScalar(1+.12*Math.max(0,c.shFl)/.15)}else G.shd.scale.setScalar(1)}   // 受け止めた瞬間に少しふくらむ
function gkShieldBlocks(t,sx,sz){                                    // この攻撃を盾が防ぐか: 盾を出し切っている間(shUp>.7)で、攻撃が正面から来た時
  if(!t.shield||t.hp<=0||(t.shSmall?!t.shPar:(t.shUp||0)<.7))return false;   // 大盾=出し切っている間 / 小盾=弾いている間だけ
  if(sx!==undefined&&sz!==undefined&&isFinite(sx)&&isFinite(sz)){const ry=t.yaw-PEASANT_FLIP,dx=sx-t.x,dz=sz-t.z,d=Math.hypot(dx,dz)||1;if((dx*Math.sin(ry)+dz*Math.cos(ry))/d<SHD.COS)return false}
  return true}
function gkShieldFx(t,melee){                                        // 盾で受け止めた: 盾の面から火花・金属音。小盾は弾いたので、プレイヤーを跳ね返す（ダメージなし・飛ばされて、しばらく攻撃できない）
  t.shFl=.15;if(audioSamples.armorSample)playSample('armorSample',.9);
  if(t.shObj){const v=new THREE.Vector3();t.shObj.getWorldPosition(v);parrySparks(v,'shield',t.shSmall?18:10)}
  if(t.shSmall&&!STAT.dead){const dx=player.x-t.x,dz=player.z-t.z,d=Math.hypot(dx,dz)||1;
    if(d<12){const k=melee?1:.5;player.kbx=dx/d;player.kbz=dz/d;player.kbv=Math.max(player.kbv||0,HURT_KB.SPEED*SHD.KB*k);player.stunT=Math.max(player.stunT||0,SHD.STUN*k)}}}
function gkNormalStart(c,kind){gkHaloVolley(c);if(c.soldier&&(kind==='dash'||kind==='leap')){c.swT=0;c.swHit=false;c.swSnd=false;c.swSpd=1;c.swKind=kind;c.mvPh='wind';c.mvT=0;c.swRanged=null;c.rpMode=false;c.cmbLeft=0;return}                                           // 普通の攻撃を始める（軍人=剣を振る / 魔法人・調査員=魔法を溜め始める）
  if(c.gkAxe&&kind!=='spell'){c.swT=0;c.swHit=false;c.swSnd=false;c.swSpd=1;c.swHit2=false;c.swSnd2=false;c.swRangedDone=false;c.swRanged=null;c.cmbLeft=0;if(kind==='throw'){c.swRanged='throw';c.swKind='adown'}else if(kind==='gsweep')c.swKind='gsweep';else c.swKind='adown';return}   // 大剣: 叩き割り(adown) / 薙ぎ払い(gsweep) //  戦闘斧: 振り下ろし(adown) / 斧投げ(throw=振り下ろしの途中で斧を投げる)
  if(c.gkSpear&&(kind==='rapid'||kind==='thrust')){c.swT=0;c.swHit=false;c.swSnd=false;c.swKind='thrust';c.swSpd=1;c.rpMode=kind==='rapid';c.rpLeft=c.rpMode?SPR.RAPID_N-1:0;return}   // 槍: 突き(thrust) / 連続突き(rapid=続けて何回か突く)
  if((c.gkSpear||c.gkDual||c.gkQuad)&&kind!=='spell'){c.swSpd=1;c.swHit2=false;c.swHit3=false;c.swHit4=false;c.swSnd2=false}   // 槍型・双剣型: 剣型の連撃の速さを引き継がない
  if(c.soldier&&kind!=='spell'){let kk=kind;c.swRanged=null;c.swRangedDone=false;if(kk==='throw'){c.swRanged='throw';kk='down'}else if(kk==='wave'){c.swRanged='wave';kk=Math.random()<.5?'side':'down'}c.swT=0;c.swHit=false;c.swSnd=false;c.swKind=kk||(Math.random()<.5?'side':'down');sswComboRoll(c);if(c.swRanged==='throw')c.cmbLeft=0;if(c.gkSwP==='ambush')c.swSpd=1.35;return}   // 投げる・斬撃波は振りの途中で飛ばす（gkSwFire）。近づいたら攻撃=素早く振る   // 軍人: kind=叩きつけ('down')か横振り('side')
  if(c.inspector){c.castArm=c.gkArm!==undefined?c.gkArm:Math.floor(Math.random()*4);c.spell=(c.gk&&c.gkSpell)?c.gkSpell:INSP_ELEM[c.castArm]}else c.spell=c.gkSpell||EMAG.TYPES[Math.floor(Math.random()*EMAG.TYPES.length)];
  c.aim={x:player.x,y:player.y-.7,z:player.z};c.bT=0;c.bShot=false;c.bFl=false;startEnemyCharge(c);
}
function gkExtraBegin(c,ex){gkHaloVolley(c);   // 追加属性の攻撃: まず攻撃方法ごとの時間だけ光を溜めてから始める（槍は頭上に出している間が溜め。剣の動きの攻撃は溜めない）
  if(c.gkCH&&ex.atk!=='flip'&&ex.atk!=='frenzy'){c.spell=ex.el;startEnemyCharge(c);if(ex.atk!=='spears'){c.spAtk=ex;c.spT=0;c.spLocked=false;c.spPre=c.gkCH;return}}
  gkAtkStart(c,ex)}
function gkAtkStart(c,ex){                                           // 追加属性ex（{el,atk}）の攻撃を始める
  c.spAtk=ex;c.spT=0;c.spAim=null;c.spLocked=false;
  if(c.inspector&&c.gkArm!==undefined)c.castArm=c.gkArm;
  if(ex.atk==='spears')gkSpearSummon(c,ex.el);
  else if(ex.atk==='erupt')gkEruptStart(c,ex.el);
  else if(ex.atk==='tornado')c.tnDone=false;else if(ex.atk==='nova')gkNovaStart(c,ex.el);else if(ex.atk==='flip')c.fl={ph:'wind',t:0};else if(ex.atk==='vortex')gkVortexStart(c,ex.el);else if(ex.atk==='blink')gkBlinkStart(c,ex.el);else if(ex.atk==='fan')gkFanStart(c,ex.el);else if(ex.atk==='chain')gkChainStart(c,ex.el);else if(ex.atk==='halo')gkHaloStart(c,ex.el);else if(ex.atk==='frenzy')gkFrenzyStart(c,ex.el);else if(ex.atk==='blizzard')gkBlizzardStart(c,ex.el);else if(ex.atk==='cwave')gkCrystalWaveStart(c,ex.el);else if(ex.atk==='cbolt')gkCboltStart(c,ex);else if(ex.atk==='drill')gkDrillStart(c,ex.el);else if(ex.atk==='summon')gkSummonStart(c,ex.el);else if(ex.atk==='hurl')gkHurlStart(c,ex.el);   // 竜巻: 両腕を上げ終わったら gkTornadoStep が出す
}
function gkAtkStep(c,dt){c.spT+=dt;if(c.spAtk.atk==='spears')gkSpearStep(c);else if(c.spAtk.atk==='erupt')gkEruptStep(c);else if(c.spAtk.atk==='tornado')gkTornadoStep(c);else if(c.spAtk.atk==='nova')gkNovaStep(c);else if(c.spAtk.atk==='flip')gkFlipStep(c,dt);else if(c.spAtk.atk==='vortex')gkVortexStep(c);else if(c.spAtk.atk==='blink')gkBlinkStep(c,dt);else if(c.spAtk.atk==='fan')gkFanStep(c);else if(c.spAtk.atk==='chain')gkChainStep(c);else if(c.spAtk.atk==='halo')gkHaloStep(c);else if(c.spAtk.atk==='frenzy')gkFrenzyStep(c,dt);else if(c.spAtk.atk==='blizzard')gkBlizzardStep(c);else if(c.spAtk.atk==='cwave')gkCrystalWaveStep(c);else if(c.spAtk.atk==='cbolt')gkCboltStep(c);else if(c.spAtk.atk==='drill')gkDrillStep(c,dt);else if(c.spAtk.atk==='summon')gkSummonStep(c);else if(c.spAtk.atk==='hurl')gkHurlStep(c)}
function gkAtkEnd(c){c.spPre=0;if(c.fz){c.mana=c.fz.mana;c.fz=null;c.swSpd=1;c.swDmgK=1;c.fzSpeed=0;c.fzLiftT=0}   // 闇の乱舞が終わる（または中断）: マナ・剣の速さ・ダメージを元に戻す
  c.spT=-1;c.spWait=GKA.WAIT[0]+Math.random()*GKA.WAIT[1]}
function gkAtkCancel(c){if(c.fl){c.fl=null;c.g.rotation.x=0}if(c.dr){c.dr=null;c.g.rotation.set(0,c.yaw-PEASANT_FLIP,0)}for(const s of gkSp)if(s.c===c&&s.st==='hover')s.rm=true;gkAtkEnd(c)}
function gkSpearMesh(col){                                           // 槍1本（柄・穂先・まわりの光）。+Z が穂先の向き
  let M=gkSpMatC.get(col);
  if(!M){const k=new THREE.Color(col),w=new THREE.Color(0xffffff);
    M={sh:new THREE.MeshBasicMaterial({color:k.clone().lerp(w,.25)}),tip:new THREE.MeshBasicMaterial({color:k.clone().lerp(w,.75)}),gl:new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.35,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide})};gkSpMatC.set(col,M)}
  if(!gkSpGeo){const L=GKA.SP.LEN;
    const sh=new THREE.CylinderGeometry(.045,.045,L*.8,6);sh.rotateX(Math.PI/2);sh.translate(0,0,-L*.1);
    const tip=new THREE.ConeGeometry(.11,L*.28,6);tip.rotateX(Math.PI/2);tip.translate(0,0,L*.44);
    const gl=new THREE.CylinderGeometry(.17,.17,L*1.05,8,1,true);gl.rotateX(Math.PI/2);
    gkSpGeo={sh,tip,gl}}
  const g=new THREE.Group();
  for(const m of [new THREE.Mesh(gkSpGeo.sh,M.sh),new THREE.Mesh(gkSpGeo.tip,M.tip),new THREE.Mesh(gkSpGeo.gl,M.gl)]){m.frustumCulled=false;g.add(m)}
  return g;
}
function gkSpearSummon(c,el){                                        // 頭上に槍を出し始める（見た目と位置は gkSpearTick が毎フレーム決める）
  const P=GKA.SP,col=GKA_COL[el]||0xffffff,k=Math.max(.8,Math.min(1.6,c.size||1));
  for(let i=0;i<P.N;i++){
    const g=gkSpearMesh(col);g.visible=false;g.scale.setScalar(.001);scene.add(g);
    gkSp.push({c,i,g,col,el,k,st:'hover',hx:(((i*.6180339)%1)-.5)*2*P.W+(Math.random()-.5)*.5,hy:((i*.4142136+.17)%1)*P.HR+(Math.random()-.5)*.3,hz:(Math.random()-.5)*1.6,off:new THREE.Vector3((Math.random()-.5)*1.8,(Math.random()-.5)*1,(Math.random()-.5)*1.8),pos:new THREE.Vector3(),dir:new THREE.Vector3(0,0,1),t:0,shown:false,rm:false,dmg:0})}
}
function gkSpearStep(c){                                             // 槍の攻撃の進行: 狙う → 狙いを固める → 一斉に飛ばす
  const P=GKA.SP;
  const SM=c.gkCH||P.SUMMON;
  if(!c.spLocked&&c.spT>=SM){c.spLocked=true;c.spAim={x:player.x,y:player.y-.7,z:player.z}}   // ここで狙いを固める（この後に動けばよけられる）
  if(c.spT<SM+P.HOLD)return;
  const T=c.spAim,dmg=BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK);
  for(const s of gkSp){if(s.c!==c||s.st!=='hover')continue;
    s.dir.set(T.x+s.off.x-s.pos.x,T.y+s.off.y-s.pos.y,T.z+s.off.z-s.pos.z);if(s.dir.lengthSq()<1e-4)s.dir.set(0,0,1);s.dir.normalize();
    s.st='fly';s.t=0;s.dmg=dmg}
  c.gkSpHit=false;castSnd('fireCastSample',.7,c.x,c.z);c.cnT=.3;gkAtkEnd(c);          // 一斉に飛ばす。腕を振り下ろして次の攻撃まで待つ
}
function gkSpRemove(n){scene.remove(gkSp[n].g);gkSp.splice(n,1)}
const _gkA=new THREE.Vector3(),_gkO=new THREE.Vector3(),_gkT=new THREE.Vector3();
function gkSpearTick(dt){                                            // 槍の毎フレームの動き（背後で待つ・飛ぶ・刺さる）。足元から噴き出す攻撃の動きも一緒に進める
  gkGhostTick(dt);gkSwTick(dt);gkEruptTick(dt);gkTornadoTick(dt);gkNovaTick(dt);gkVortexTick(dt);gkBlinkTick(dt);gkFanTick(dt);gkChainTick(dt);gkHaloTick(dt);gkFrenzyTick(dt);gkBlizzardTick(dt);gkCrystalWaveTick(dt);gkCboltTick(dt);gkDrillTick(dt);gkSummonTick(dt);gkHurlTick(dt);
  if(!gkSp.length)return;
  const P=GKA.SP;
  for(let n=gkSp.length-1;n>=0;n--){
    const s=gkSp[n],c=s.c,g=s.g,p=s.pos;
    if(s.st==='hover'){
      if(s.rm||c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)){gkSpRemove(n);continue}
      const t=c.spT,z=c.size||1,fx=Math.sin(c.yaw),fz=Math.cos(c.yaw),rx=Math.cos(c.yaw),rz=-Math.sin(c.yaw);
      const cy=c.y+(c.jy||0)+z*P.H0,hold=t>=(c.gkCH||P.SUMMON)?.03:0,rise=pwSmooth(Math.max(0,Math.min(1,(t-s.i*.04)/.7)));   // 頭のずっと上に、ばらばらに浮かぶ（手の高さからのぼって位置につく）
      p.set(c.x+(rx*s.hx+fx*s.hz)*z+(Math.random()-.5)*hold,cy+z*s.hy-(1-rise)*z*1.4+.08*Math.sin(c.t*2.5+s.i*1.7)+(Math.random()-.5)*hold,c.z+(rz*s.hx+fz*s.hz)*z+(Math.random()-.5)*hold);   // 狙いを固めてからは小刻みに震える
      const T=c.spAim||{x:player.x,y:player.y-.7,z:player.z};
      _gkA.set(T.x+s.off.x-p.x,T.y+s.off.y-p.y,T.z+s.off.z-p.z).normalize();   // 狙う向き
      _gkO.set(p.x-c.x,p.y-(cy-z*.5),p.z-c.z).normalize();                      // 出た時の向き（外・上向き）
      const e=pwSmooth(Math.max(0,Math.min(1,(t-.3)/Math.max(.1,(c.gkCH||P.SUMMON)-.3))));
      _gkO.lerp(_gkA,e).normalize();                                            // 出た向きから、だんだん狙いへ向く
      const sc=s.k*pwSmooth(Math.max(0,Math.min(1,(t-s.i*.05)/.25)));           // 1本ずつ順にあらわれる
      g.visible=sc>.02;g.scale.setScalar(Math.max(.001,sc));g.position.copy(p);_gkT.copy(p).add(_gkO);g.lookAt(_gkT);
      if(!s.shown&&sc>.05){s.shown=true;addSmoke(p.x,p.y,p.z,.28,[s.col])}
    }else if(s.st==='fly'){
      s.t+=dt;const dist=P.SPEED*dt,ns=Math.max(1,Math.ceil(dist/.3)),stp=dist/ns,tl=P.LEN*.5*s.k;let end=0;   // end: 1=プレイヤーに当たった / 2=地面・壁に刺さった
      for(let q=0;q<ns&&!end;q++){
        p.addScaledVector(s.dir,stp);
        const tx=p.x+s.dir.x*tl,ty=p.y+s.dir.y*tl,tz=p.z+s.dir.z*tl;   // 穂先で判定する
        if(!STAT.dead&&Math.hypot(tx-player.x,tz-player.z)<P.HITR&&ty>player.y-1.7&&ty<player.y+.25){playerMagic(s.dmg,c);if(!c.gkSpHit){c.gkSpHit=true;gkElemHit(s.el,c)}end=1}
        else if(s.t>.1&&solidAt(tx,ty,tz))end=2;
      }
      if(end===1){JFX.impact(p.x+s.dir.x*tl,p.y+s.dir.y*tl,p.z+s.dir.z*tl,{cols:gkPal(s.el),power:1.1,shards:12,shake:false});for(let k=0;k<4;k++)addSmoke(p.x+s.dir.x*tl,p.y+s.dir.y*tl,p.z+s.dir.z*tl,.22+Math.random()*.15,[s.col]);gkSpRemove(n);continue}
      if(end===2){s.st='stuck';s.t=0;JFX.impact(p.x+s.dir.x*tl,p.y+s.dir.y*tl,p.z+s.dir.z*tl,{cols:gkPal(s.el),power:.7,shards:8,shake:false});for(let k=0;k<2;k++)addSmoke(p.x+s.dir.x*tl,p.y+s.dir.y*tl,p.z+s.dir.z*tl,.2,[s.col])}
      else if(s.t>P.LIFE){gkSpRemove(n);continue}
      for(let k=0;k<3;k++)gkPart(s.el,p.x-s.dir.x*k*.45+(Math.random()-.5)*.3,p.y-s.dir.y*k*.45+(Math.random()-.5)*.3,p.z-s.dir.z*k*.45+(Math.random()-.5)*.3,-s.dir.x*2,-s.dir.y*2+.5,-s.dir.z*2,.35,.1,gkFlameMats(s.col));   // 飛ぶ槍の尾
      g.position.copy(p);_gkT.copy(p).add(s.dir);g.lookAt(_gkT);
    }else{                                                                       // 刺さった: 少しのあいだ残って縮んで消える
      s.t+=dt;if(s.t>=.6){gkSpRemove(n);continue}
      g.scale.setScalar(Math.max(.001,s.k*(1-s.t/.6)));
    }
  }
}
// ---------- 追加属性の攻撃「足元から噴き出す」: プレイヤーの足元に属性色の印（輪＋集まる粒）が出て、少しして噴き出す。印は最初だけプレイヤーを追い、固まってから動けばよけられる ----------
// 雷=足元から空へ走る雷 / 創造=創造の魔法と同じ結晶（せり上がって突き上げる） / ほか=属性の色の粒を集めた炎の柱
const gkEr=[],gkFlameMatC=new Map();let gkRingGeo=null;
const GKPM={fire:()=>fireMats,ice:()=>iceMats,water:()=>waterMats,dark:()=>darkMats,a:()=>blastMats,b:()=>lvMats,c:()=>ctlMats,d:()=>creaBlue,e:()=>hcMats};   // 属性→プレイヤーの魔法の粒の色
function gkPal(el){return JFX.PAL[el==='blast'?'a':el]||JFX.PAL.fire}   // 番人の属性 → 演出の色（プレイヤーの同じ魔法と同じ色）
const gkSparkM=new Map();
function gkPart(el,x,y,z,vx,vy,vz,life,size,mats){             // 追加属性の攻撃の粒: 大きさ・寿命・向きをばらつかせ、ときどき明るい火花も混ぜる（氷は三角のかけら）
  const pm=GKPM[el];if(pm)mats=pm();
  const r=Math.random(),sz=size*(r<.15?1.9:r<.6?1:.55),lf=life*(.7+Math.random()*.8),h=Math.hypot(vx,vz),j=.6+h*.35,ice=el==='ice';
  addFirePart(x,y,z,vx+(Math.random()-.5)*j,vy*(.75+Math.random()*.6),vz+(Math.random()-.5)*j,lf,ice?sz*1.5:sz,mats,ice?iceGeo:undefined);
  if(Math.random()<.2){let M=gkSparkM.get(el);if(!M){M=[new THREE.MeshBasicMaterial({color:gkPal(el)[0],transparent:true,opacity:1,blending:el==='dark'?THREE.NormalBlending:THREE.AdditiveBlending,depthWrite:false})];gkSparkM.set(el,M)}
    const sp=3+Math.random()*5,a=Math.random()*6.283;addFirePart(x,y,z,Math.cos(a)*sp+vx*.5,Math.abs(vy)*.8+Math.random()*4,Math.sin(a)*sp+vz*.5,.3+Math.random()*.4,size*.28,M,ice?iceGeo:undefined)}
}
function gkFlameMats(col){let M=gkFlameMatC.get(col);if(!M){const k=new THREE.Color(col),w=new THREE.Color(0xffffff),b=new THREE.Color(0x000000);
  M=(col===GKA_COL.dark?[0x2a1040,0x1a0f26,0x050508].map(h=>new THREE.Color(h)):[k.clone().lerp(w,.3),k.clone(),k.clone().lerp(b,.45)]).map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:gkBl(col),depthWrite:false}));gkFlameMatC.set(col,M)}return M}   // 闇の粒はプレイヤーの闇と同じ黒紫
function gkGroundY(x,z){return Math.max(supportAt(x,z,player.gy+.3),WATER)}
function gkEruptStart(c,el){
  const col=GKA_COL[el]||0xffffff,mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
  if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  const ring=new THREE.Mesh(gkRingGeo,mat);ring.rotation.x=-Math.PI/2;ring.visible=false;ring.frustumCulled=false;scene.add(ring);
  gkEr.push({c,el,col,st:'warn',x:player.x,z:player.z,gy:0,ring,mat,t:0,hit:false,dmg:0});
}
function gkEruptStep(c){                                              // 印を固めてから少し待って、噴き出す
  const P=GKA.ER;if(c.spT<P.TRACK+P.LOCK)return;
  const e=gkEr.find(q=>q.c===c&&q.st==='warn');
  if(e){
    e.st='burst';e.t=0;e.gy=gkGroundY(e.x,e.z);e.dmg=BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK);
    castSnd('fireCastSample',.7,e.x,e.z);
    JFX.impact(e.x,e.gy,e.z,{cols:gkPal(e.el),power:1.5,shards:18,dome:true,spikes:8,arcs:e.el==='thunder'?6:0,shake:false});   // 噴き出し: 衝撃の輪・破片・地面のトゲ
    if(e.el==='d'){                                                  // 創造: 創造の魔法と同じ結晶を、足元とそのまわりに立てる（足元の結晶が突き上げてダメージを与える）
      const yr=player.gy+.3;spawnCreaRock(e.x,e.z,1,yr);
      for(let k=0;k<4;k++){const a=k/4*6.283+Math.random()*.5;spawnCreaRock(e.x+Math.cos(a)*P.R*.95,e.z+Math.sin(a)*P.R*.95,.8,yr)}
      e.ring.visible=false;e.t=P.DUR;e.hit=true;                       // 結晶側で判定するので、ここでは何もせず片づける
    }else if(e.el==='thunder'){                                      // 雷: 足元から空へ走る稲妻（3本）
      for(let b=0;b<3;b++){
        const ox=b?(Math.random()-.5)*P.R*1.4:0,oz=b?(Math.random()-.5)*P.R*1.4:0,pts=[],N=12,H=10;
        for(let i=0;i<=N;i++){const t=i/N,j=i?.6*(.4+Math.random()*.6):0;pts.push(new THREE.Vector3(e.x+ox+(Math.random()-.5)*2*j,e.gy+H*t,e.z+oz+(Math.random()-.5)*2*j))}
        const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
              mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),g=new THREE.Group();
        boltSegs(g,pts,b?.22:.4,mOut);boltSegs(g,pts,b?.07:.12,mCore);scene.add(g);bolts.push({g,mOut,mCore,t:0,life:.45})}
      for(let i=0;i<12;i++)addFirePart(e.x,e.gy+.2,e.z,(Math.random()-.5)*7,Math.random()*5,(Math.random()-.5)*7,.3+Math.random()*.3,.08+Math.random()*.08,blastMats);
    }
  }
  gkAtkEnd(c);
}
function gkErRemove(n){const e=gkEr[n];scene.remove(e.ring);e.mat.dispose();gkEr.splice(n,1)}
function gkEruptTick(dt){                                             // 印の表示・粒・炎・当たり判定（持ち主が倒れても、噴き出した後の炎は最後まで出す）
  if(!gkEr.length)return;
  const P=GKA.ER;
  for(let n=gkEr.length-1;n>=0;n--){
    const e=gkEr[n],c=e.c;
    if(e.st==='warn'){
      if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='erupt'){gkErRemove(n);continue}
      if(c.spT<P.TRACK){e.x=player.x;e.z=player.z}                    // 最初だけプレイヤーを追う
      const gy=gkGroundY(e.x,e.z),lock=c.spT>=P.TRACK,u=Math.min(1,c.spT/(P.TRACK+P.LOCK));
      e.ring.visible=true;e.ring.position.set(e.x,gy+.12,e.z);e.ring.scale.setScalar(P.R);
      e.mat.opacity=(.3+.45*u)*(lock?.75+.25*Math.sin(c.spT*40):1);   // 固まったら小刻みに点滅して知らせる
      for(let k=0;k<3;k++){const a=Math.random()*6.283,r=P.R*(1.1+Math.random()*.5);   // 外から中心へ集まる粒
        gkPart(e.el,e.x+Math.cos(a)*r,gy+.15,e.z+Math.sin(a)*r,-Math.cos(a)*r*2,1+Math.random()*1.6,-Math.sin(a)*r*2,.5,.09+Math.random()*.07,gkFlameMats(e.col))}
    }else{
      e.t+=dt;
      if(e.el!=='d'&&e.el!=='thunder'){                               // 炎: 粒を集めた柱（下から上へ吹き上がる）
        for(let k=0;k<6;k++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*P.R*.85;
          gkPart(e.el,e.x+Math.cos(a)*r,e.gy+.1+Math.random()*.4,e.z+Math.sin(a)*r,(Math.random()-.5)*1.2,7+Math.random()*6,(Math.random()-.5)*1.2,.45+Math.random()*.35,.16+Math.random()*.2,gkFlameMats(e.col))}
        e.ring.visible=true;e.ring.position.set(e.x,e.gy+.12,e.z);e.mat.opacity=Math.max(0,.8*(1-e.t/P.DUR))}
      else e.ring.visible=false;
      if(!e.hit&&e.t>=.1){e.hit=true;                                   // 噴き出した瞬間: 足元にいたらダメージ
        if(!STAT.dead&&Math.hypot(player.x-e.x,player.z-e.z)<P.R&&player.y-1.7<e.gy+3.5){playerMagic(e.dmg,c);gkElemHit(e.el,c)}}
      if(e.t>=P.DUR)gkErRemove(n);
    }
  }
}
// ---------- 追加属性の攻撃「竜巻」: 両腕を上げ終わると、プレイヤーの近く（6.5〜9m）に属性色の竜巻が1本出て、5〜7秒かけてゆっくり近づいてくる。触れている間は一定の間隔でダメージ（動けばよけられる速さ）。雷=竜巻の中で稲光が走る / 火・ほか=属性色の粒が渦を巻いてのぼる ----------
GKA.TN={DIST:[6.5,9],LIFE:[5,7],SPEED:1.5,SWAY:1.2,H:6,LAYERS:8,HIT:1.6,TICK:.5,DMGK:.3,IN:.9,OUT:.7,SPIN:7,CAST:1,MAX:8,DUST:[0x8a7d68,0x6f6555,0xa09580]};   // DIST=出る距離(m) / LIFE=消えるまでの秒数[最短,最長] / SPEED=近づく速さ(m/秒) / SWAY=左右の揺れ(m/秒) / H=高さ(m・大きさ1倍) / HIT=当たる半径(m) / TICK=ダメージの間隔(秒) / DMGK=1回のダメージ（火のビームの威力に対する倍率） / IN・OUT=出る・消える秒数 / SPIN=回る速さ / CAST=腕を上げてから出るまでの秒数 / MAX=同時に出せる数
const gkTn=[];let gkTnGeo=null,gkTnTex=null;
function gkTnAssets(){                                               // 竜巻の形（細い輪を重ねた漏斗）と、渦の筋の絵を一度だけ作る
  if(gkTnGeo)return;
  const P=GKA.TN,cv=document.createElement('canvas');cv.width=128;cv.height=64;const x=cv.getContext('2d');
  for(let i=0;i<14;i++){const px=Math.random()*128,w=2+Math.random()*7,a=.25+Math.random()*.65;
    for(const dx of [-128,0,128]){x.save();x.translate(px+dx,32);x.transform(1,0,-.45,1,0,0);x.fillStyle='rgba(255,255,255,'+a+')';x.fillRect(-w/2,-40,w,80);x.restore()}}   // 斜めの筋（左右の端でも途切れないように3回描く）
  gkTnTex=new THREE.CanvasTexture(cv);gkTnTex.wrapS=gkTnTex.wrapT=THREE.RepeatWrapping;
  const rad=t=>.3+Math.pow(t,1.4)*2,h=P.H/P.LAYERS;gkTnGeo=[];                // 下ほど細く、上ほど広がる
  for(let i=0;i<P.LAYERS;i++)gkTnGeo.push(new THREE.CylinderGeometry(rad((i+1)/P.LAYERS),rad(i/P.LAYERS),h*1.1,16,1,true));
}
function gkTornadoStep(c){                                           // 腕を上げ終わったら、竜巻を出して攻撃を終える
  if(c.tnDone||c.spT<GKA.TN.CAST)return;
  c.tnDone=true;gkTornadoSpawn(c,c.spAtk.el);castSnd('fireCastSample',.7,c.x,c.z);c.cnT=.3;gkAtkEnd(c);
}
function gkTornadoSpawn(c,el){
  if(gkTn.length>=GKA.TN.MAX)return;
  gkTnAssets();
  const P=GKA.TN,col=GKA_COL[el]||0xffffff,k=Math.max(.8,Math.min(1.6,c.size||1));
  let x=player.x,z=player.z;
  for(let n=0;n<10;n++){const a=Math.random()*6.283,d=P.DIST[0]+Math.random()*(P.DIST[1]-P.DIST[0]);x=player.x+Math.cos(a)*d;z=player.z+Math.sin(a)*d;
    if(Math.abs(supportAt(x,z,player.gy+.3)-player.gy)<3)break}      // プレイヤーと同じくらいの高さの場所を選ぶ（崖の上下は避ける）
  const g=new THREE.Group(),mats=[],white=new THREE.Color(0xffffff);
  for(let i=0;i<P.LAYERS;i++){
    const m=new THREE.MeshBasicMaterial({map:gkTnTex,color:new THREE.Color(col).lerp(white,i/P.LAYERS*(col===GKA_COL.dark?.15:.5)),transparent:true,opacity:.6*(1-i/P.LAYERS*.4),blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(gkTnGeo[i],m);mesh.position.y=(i+.5)*P.H/P.LAYERS;mesh.rotation.y=Math.random()*6.283;mesh.frustumCulled=false;g.add(mesh);mats.push(m)}
  const gy=Math.max(supportAt(x,z,player.gy+.3),WATER);
  g.position.set(x,gy,z);g.scale.setScalar(.001);scene.add(g);JFX.impact(x,gy,z,{cols:gkPal(el),power:1.5,shards:14,dome:true,shake:false});
  gkTn.push({c,el,col,k,g,mats,x,z,gy,t:0,life:P.LIFE[0]+Math.random()*(P.LIFE[1]-P.LIFE[0]),tick:0,fx:0,bt:.3,ph:Math.random()*6.283,
    dmg:BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK)});
}
function gkTornadoTick(dt){                                          // 竜巻の動き・見た目・当たり判定
  if(!gkTn.length)return;
  const P=GKA.TN;
  for(let n=gkTn.length-1;n>=0;n--){
    const e=gkTn[n],c=e.c;e.t+=dt;
    if((c.dead!==undefined||c.hp<=0||!creatures.includes(c))&&e.t<e.life-P.OUT)e.life=e.t+P.OUT;   // 持ち主が倒れたら、すぐ薄れて消える
    if(e.t>=e.life){scene.remove(e.g);for(const m of e.mats)m.dispose();gkTn.splice(n,1);continue}
    const s=pwSmooth(e.t/P.IN)*pwSmooth((e.life-e.t)/P.OUT),K=e.k;
    let dx=player.x-e.x,dz=player.z-e.z;const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    const sp=d>.6?P.SPEED:0,sw=Math.sin(e.t*1.6+e.ph)*P.SWAY;           // プレイヤーへゆっくり近づく（左右にゆらゆら）
    e.x+=(dx*sp-dz*sw)*dt;e.z+=(dz*sp+dx*sw)*dt;
    e.gy+=(Math.max(supportAt(e.x,e.z,e.gy+.3),WATER)-e.gy)*Math.min(1,dt*8);
    e.g.position.set(e.x,e.gy,e.z);e.g.scale.setScalar(Math.max(.001,K*s));
    const ch=e.g.children;for(let i=0;i<ch.length;i++)ch[i].rotation.y+=dt*P.SPIN*(1-i*.06);   // 下の輪ほど速く回る
    const H=P.H*K*s;
    if(s>.2){
      for(let q=0;q<2;q++){const h=Math.random(),r=(.3+Math.pow(h,1.4)*2)*K*s*1.15,a=Math.random()*6.283;   // 渦を巻いてのぼる粒
        gkPart(e.el,e.x+Math.cos(a)*r,e.gy+h*H,e.z+Math.sin(a)*r,-Math.sin(a)*4,.8+Math.random()*1.5,Math.cos(a)*4,.5+Math.random()*.3,.1+Math.random()*.12,gkFlameMats(e.col))}
      e.fx-=dt;if(e.fx<=0){e.fx=.12;addSmoke(e.x+(Math.random()-.5)*1.6*K,e.gy+.15,e.z+(Math.random()-.5)*1.6*K,.4*K,P.DUST)}   // 足もとの土煙
      if(e.el==='thunder'){e.bt-=dt;if(e.bt<=0){e.bt=.25+Math.random()*.4;                                  // 雷: 竜巻の中を稲光が走る
        const pts=[],N=8;for(let i=0;i<=N;i++){const t=i/N,j=i&&i<N?.5*K*s:0;pts.push(new THREE.Vector3(e.x+(Math.random()-.5)*2*j,e.gy+H*(1-t),e.z+(Math.random()-.5)*2*j))}
        const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
              mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),bg=new THREE.Group();
        boltSegs(bg,pts,.14,mOut);boltSegs(bg,pts,.05,mCore);scene.add(bg);bolts.push({g:bg,mOut,mCore,t:0,life:.2})}}
    }
    if(e.tick>0)e.tick-=dt;
    if(s>.5&&e.tick<=0&&!STAT.dead&&Math.hypot(player.x-e.x,player.z-e.z)<P.HIT*K+.3&&player.y-1.7<e.gy+P.H*K&&player.y>e.gy-.3){   // 触れている間、一定の間隔でダメージ（竜巻の外へ飛ばされる）
      e.tick=P.TICK;playerMagic(e.dmg,{x:e.x,y:e.gy,z:e.z});if(!e.eff){e.eff=true;gkElemHit(e.el,c)}}
  }
}
// ---------- 追加属性の攻撃「周りを燃やす」（近距離）: 番人の足もとから属性色の輪が広がって印になり、少しして番人の周り一面が噴き出す。輪の中にいるとダメージ（離れればよけられる）。雷=周りに稲妻が何本も走る / 創造=創造の魔法と同じ結晶が番人の周りに立つ（結晶が突き上げる） / ほか=属性の色の炎が一面に吹き上がる ----------
GKA.NV={R:4.5,GROW:.5,LOCK:1,DMGK:1.2,DUR:.8,BOLTS:7};   // R=燃える半径(m) / GROW=輪が広がりきる秒数 / LOCK=印が出てから噴き出すまでの秒数（この間に離れればよけられる） / DMGK=ダメージ（火のビームの威力に対する倍率） / DUR=炎・雷が出ている秒数 / BOLTS=雷の本数
const gkNv=[];
function gkNovaStart(c,el){
  const col=GKA_COL[el]||0xffffff,mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
  if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  const ring=new THREE.Mesh(gkRingGeo,mat);ring.rotation.x=-Math.PI/2;ring.visible=false;ring.frustumCulled=false;scene.add(ring);
  gkNv.push({c,el,col,st:'warn',x:c.x,z:c.z,gy:c.y,ring,mat,t:0,hit:false,dmg:0});
}
function gkNovaStep(c){                                              // 印を出して少し待ってから、周り一面に噴き出す
  const P=GKA.NV;if(c.spT<P.LOCK)return;
  const e=gkNv.find(q=>q.c===c&&q.st==='warn');
  if(e){
    e.st='burst';e.t=0;e.x=c.x;e.z=c.z;e.gy=Math.max(supportAt(c.x,c.z,c.y+.3),WATER);
    e.dmg=BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK);
    castSnd('fireCastSample',.8,e.x,e.z);
    JFX.impact(e.x,e.gy,e.z,{cols:gkPal(e.el),power:2.3,shards:30,dome:true,spikes:14,arcs:e.el==='thunder'?8:0});   // 周り一面: 大きな衝撃波・破片・トゲ
    if(e.el==='d'){                                                  // 創造: 番人の周りに結晶（内側3本・外側5本）。結晶が突き上げてダメージを与える
      const yr=c.y+.3;
      for(let k=0;k<3;k++){const a=k/3*6.283+Math.random()*.5;spawnCreaRock(e.x+Math.cos(a)*P.R*.45,e.z+Math.sin(a)*P.R*.45,.9,yr)}
      for(let k=0;k<5;k++){const a=k/5*6.283+Math.random()*.5;spawnCreaRock(e.x+Math.cos(a)*P.R*.9,e.z+Math.sin(a)*P.R*.9,.9,yr)}
      e.ring.visible=false;e.t=P.DUR;e.hit=true;
    }else if(e.el==='thunder'){                                      // 雷: 周りのあちこちから空へ走る稲妻
      for(let b=0;b<P.BOLTS;b++){
        const a=Math.random()*6.283,r=Math.sqrt(Math.random())*P.R*.95,bx=e.x+Math.cos(a)*r,bz=e.z+Math.sin(a)*r,pts=[],N=12,H=10;
        for(let i=0;i<=N;i++){const t=i/N,j=i?.6*(.4+Math.random()*.6):0;pts.push(new THREE.Vector3(bx+(Math.random()-.5)*2*j,e.gy+H*t,bz+(Math.random()-.5)*2*j))}
        const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
              mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),g=new THREE.Group();
        boltSegs(g,pts,.3,mOut);boltSegs(g,pts,.1,mCore);scene.add(g);bolts.push({g,mOut,mCore,t:0,life:.45});
        for(let i=0;i<3;i++)addFirePart(bx,e.gy+.2,bz,(Math.random()-.5)*6,Math.random()*4,(Math.random()-.5)*6,.3+Math.random()*.3,.08+Math.random()*.08,blastMats)}
    }
  }
  gkAtkEnd(c);
}
function gkNvRemove(n){const e=gkNv[n];scene.remove(e.ring);e.mat.dispose();gkNv.splice(n,1)}
function gkNovaTick(dt){                                             // 印の表示・粒・炎・当たり判定（持ち主が倒れても、噴き出した後の炎は最後まで出す）
  if(!gkNv.length)return;
  const P=GKA.NV;
  for(let n=gkNv.length-1;n>=0;n--){
    const e=gkNv[n],c=e.c;
    if(e.st==='warn'){
      if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='nova'){gkNvRemove(n);continue}
      const gy=Math.max(supportAt(c.x,c.z,c.y+.3),WATER),u=Math.min(1,c.spT/P.LOCK),lock=c.spT>=P.LOCK*.5;
      e.ring.visible=true;e.ring.position.set(c.x,gy+.12,c.z);e.ring.scale.setScalar(Math.max(.01,P.R*pwSmooth(c.spT/P.GROW)));   // 輪が番人の足もとから広がる
      e.mat.opacity=(.3+.45*u)*(lock?.75+.25*Math.sin(c.spT*40):1);                                                                // 半分を過ぎたら小刻みに点滅して知らせる
      for(let k=0;k<3;k++){const a=Math.random()*6.283,r=P.R*(.2+Math.random()*.8);                                             // 輪の中で粒がのぼる
        gkPart(e.el,c.x+Math.cos(a)*r,gy+.15,c.z+Math.sin(a)*r,0,1+Math.random()*1.6,0,.5,.09+Math.random()*.07,gkFlameMats(e.col))}
    }else{
      e.t+=dt;
      if(e.el!=='d'&&e.el!=='thunder'){                               // 炎: 周り一面に粒を集めた柱が吹き上がる
        for(let k=0;k<10;k++){const a=Math.random()*6.283,r=Math.sqrt(Math.random())*P.R;
          gkPart(e.el,e.x+Math.cos(a)*r,e.gy+.1+Math.random()*.4,e.z+Math.sin(a)*r,(Math.random()-.5)*1.2,7+Math.random()*6,(Math.random()-.5)*1.2,.45+Math.random()*.35,.16+Math.random()*.2,gkFlameMats(e.col))}
        e.ring.visible=true;e.ring.position.set(e.x,e.gy+.12,e.z);e.ring.scale.setScalar(P.R);e.mat.opacity=Math.max(0,.8*(1-e.t/P.DUR))}
      else e.ring.visible=false;
      if(!e.hit&&e.t>=.1){e.hit=true;                                   // 噴き出した瞬間: 輪の中にいたらダメージ
        if(!STAT.dead&&Math.hypot(player.x-e.x,player.z-e.z)<P.R&&player.y-1.7<e.gy+3.5){playerMagic(e.dmg,c);gkElemHit(e.el,c)}}
      if(e.t>=P.DUR)gkNvRemove(n);
    }
  }
}
// ---------- 追加属性の攻撃「火の渦」（火の追加属性だけが抽選される・近距離）: 番人の周りに炎の渦をグルグル回す。出ている間、渦の中と縁に入ると火ダメージ＋火傷を受けて外へ強く押し返される（ほぼ近づけない）。最初の少しは輪だけ出る予告で、ダメージはまだ無い。番人は渦の間その場で動かない ----------
GKA.VX={R:3.2,BAND:1,WARN:.5,DUR:4.5,ARMS:3,W:3.2,TICK:.3,DMGK:.5,PUSH:.9,BURN:1.2,H:3.2};   // R=渦の半径(m) / BAND=渦の外側の縁の幅(m。R+BANDまでが当たり判定) / WARN=予告の秒（ダメージ無し） / DUR=渦が出ている秒 / ARMS=渦の腕の本数 / W=回る速さ(rad/秒) / TICK=ダメージの間隔(秒) / DMGK=1回のダメージ（火のビームの威力に対する倍率） / PUSH=押し返す強さ（プレイヤーが敵に吹き飛ばされる強さに対する倍率） / BURN=火傷を付け直す間隔(秒) / H=炎の高さ(m)
const gkVx=[];
function gkVortexStart(c,el){
  const col=GKA_COL[el]||0xffffff,mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
  if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  const ring=new THREE.Mesh(gkRingGeo,mat);ring.rotation.x=-Math.PI/2;ring.visible=false;ring.frustumCulled=false;scene.add(ring);
  gkVx.push({c,el,col,ring,mat,tick:0,burn:0,snd:false});
}
function gkVortexStep(c){if(c.spT>=GKA.VX.DUR)gkAtkEnd(c)}
function gkVxRemove(n){const e=gkVx[n];scene.remove(e.ring);e.mat.dispose();gkVx.splice(n,1)}
function gkVortexTick(dt){                                           // 渦の表示・粒・押し返し・ダメージ（番人が倒れたり攻撃が止まったら消える）
  if(!gkVx.length)return;
  const P=GKA.VX;
  for(let n=gkVx.length-1;n>=0;n--){
    const e=gkVx[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='vortex'){gkVxRemove(n);continue}
    const t=c.spT,gy=Math.max(supportAt(c.x,c.z,c.y+.3),WATER),active=t>=P.WARN,fade=Math.min(1,Math.max(0,(P.DUR-t)/.4)),grow=pwSmooth(Math.min(1,t/(P.WARN+.3))),R=P.R*grow,edge=(P.R+P.BAND)*grow;
    e.ring.visible=true;e.ring.position.set(c.x,gy+.12,c.z);e.ring.scale.setScalar(Math.max(.01,edge));
    e.mat.opacity=(active?.4+.1*Math.sin(t*20):(.2+.4*t/P.WARN)*(.75+.25*Math.sin(t*40)))*fade;   // 予告の間は点滅
    const ang0=t*P.W;
    for(let a=0;a<P.ARMS;a++)for(let k=0;k<5;k++){if(Math.random()>fade)continue;                       // 腕ごとに、回る向きの後ろへ尾を引く炎の粒
      const th=ang0+a/P.ARMS*6.283-Math.random()*.9,r=R*(.8+Math.random()*.4),sp=P.W*r,cs=Math.cos(th),sn=Math.sin(th);
      gkPart(e.el,c.x+cs*r,gy+.1+Math.random()*P.H*.9,c.z+sn*r,-sn*sp,1.5+Math.random()*2.5,cs*sp,.45+Math.random()*.3,.18+Math.random()*.2,gkFlameMats(e.col))}
    if(!active||STAT.dead)continue;
    if(!e.snd){e.snd=true;castSnd('fireCastSample',.8,c.x,c.z)}
    let dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz);
    if(d>=P.R+P.BAND||player.y-1.7>=gy+P.H+.5){e.tick=0;continue}                                      // 渦の外・炎より高く跳んでいる時は何も起きない
    if(d<1e-3){dx=Math.sin(player.yaw);dz=Math.cos(player.yaw);d=1}
    player.kbx=dx/d;player.kbz=dz/d;player.kbv=Math.max(player.kbv||0,CREA.KB_PL*P.PUSH);               // 外へ強く押し返す
    if(!player.air){player.air=true;player.vy=Math.max(player.vy,CREA.KB_PLUP*.3)}
    e.tick-=dt;e.burn-=dt;
    if(e.tick<=0){e.tick=P.TICK;playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);
      if(!STAT.dead&&e.burn<=0){e.burn=P.BURN;gkElemHit(e.el,c)}}
  }
}
// ---------- 追加属性の攻撃「雷の瞬間移動」（雷の追加属性だけが抽選される・遠距離）: プレイヤーの雷の長押しと同じく、稲妻になって瞬間移動する。番人が雷と共にプレイヤーの目の前（視線の先）へ移り、着いた所に空から雷が落ちる。着地点の輪はしばらくプレイヤーの正面を追い、固まってから飛ぶ（この間に輪から離れればよけられる）。輪の中にいたら雷のダメージ ----------
GKA.BK={WIND:0,LOCK:0,DIST:2.6,R:3.6,DMGK:.1,REC:.1,H:28};   // WIND=構えてから飛ぶまでの秒（0=予備動作なしですぐ飛ぶ） / LOCK=着地点の輪が固まる秒（0=輪は出さない）（それまではプレイヤーの視線の先を追う） / DIST=プレイヤーの何m先に出るか / R=雷が落ちて当たる半径(m) / DMGK=ダメージ（雷の威力に対する倍率。微小） / REC=着いたあとの隙(秒。すぐ通常攻撃に続く＝ワープ→近接のコンボ) / H=空から落ちる雷の高さ(m)
const gkBk=[];
function gkBlinkDest(c){                                             // 着地点: プレイヤーの視線（水平）の先。壁の中・段差が大きい所はやめて、近い所を試す。無ければ null
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  for(const d of [GKA.BK.DIST,GKA.BK.DIST*.7]){
    const x=player.x+fx*d,z=player.z+fz*d,y=Math.max(supportAt(x,z,(player.gy!==undefined?player.gy:c.y)+.3),WATER);
    if(Math.abs(y-(player.gy!==undefined?player.gy:c.y))<2.5&&!solidAt(x,y+1,z)&&!solidAt(x,y+1.8,z))return{x,z,y}}
  return null;
}
function gkBlinkStart(c,el){
  const col=GKA_COL[el]||0xffffff,mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
  if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  const ring=new THREE.Mesh(gkRingGeo,mat);ring.rotation.x=-Math.PI/2;ring.visible=false;ring.frustumCulled=false;scene.add(ring);
  c.bk={t:gkBlinkDest(c),fired:false,at:0};
  gkBk.push({c,el,col,ring,mat});
}
function gkBlinkStep(c,dt){                                          // 輪が視線の先を追う → 固まる → 雷と共に飛ぶ → 少し隙
  const P=GKA.BK,B=c.bk;if(!B)return;
  if(B.fired){if(c.spT>=B.at+P.REC){gkAtkEnd(c);c.swWait=0;c.bWait=0;c.gkCombo=true}return}   // ワープのあとは待たずに、すぐ通常攻撃へつなぐ（gkAI が gkCombo を見て始める）
  if(c.spT<P.LOCK)B.t=gkBlinkDest(c)||B.t;
  if(c.spT<P.WIND)return;
  if(!B.t){gkAtkEnd(c);return}                                       // 出られる所が無い: やめる
  const T=B.t,ox=c.x,oy=c.y,oz=c.z,el=c.spAtk.el;
  const mk=(pts,wo,wc,life)=>{const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
      mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),g=new THREE.Group();
    boltSegs(g,pts,wo,mOut);boltSegs(g,pts,wc,mCore);scene.add(g);bolts.push({g,mOut,mCore,t:0,mine:false,life});};
  const a=new THREE.Vector3(ox,oy+1.2,oz),b=new THREE.Vector3(T.x,T.y+1.2,T.z),pts=[a.clone()],SEG=14,len=a.distanceTo(b),dir=b.clone().sub(a).normalize(),Rr=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
  if(Rr.lengthSq()<1e-4)Rr.set(1,0,0);Rr.normalize();const U=new THREE.Vector3().crossVectors(Rr,dir).normalize();
  for(let i=1;i<=SEG;i++){const t=i/SEG,j=(i===SEG?.2:.7)*(.4+Math.random()*.6);pts.push(a.clone().addScaledVector(dir,len*t).addScaledVector(Rr,(Math.random()-.5)*2*j).addScaledVector(U,(Math.random()-.5)*2*j))}
  mk(pts,.4,.12,.5);                                                  // 通った道すじの稲妻（元の場所から着地点まで）
  const top=T.y+P.H,vp=[new THREE.Vector3(T.x,top,T.z)];             // 着地点: 空から雷が落ちる
  for(let i=1;i<=12;i++){const t=i/12,j=(i===12?0:.9)*(.4+Math.random()*.6);vp.push(new THREE.Vector3(T.x+(Math.random()-.5)*2*j,top+(T.y-top)*t,T.z+(Math.random()-.5)*2*j))}
  mk(vp,.5,.16,.6);
  fireBurst(ox,oy+1.2,oz,14,5);fireBurst(T.x,T.y+.3,T.z,20,6);
  JFX.impact(ox,oy,oz,{cols:JFX.PAL.thunder,power:1.1,shards:10,arcs:3,shake:false});JFX.impact(T.x,T.y,T.z,{cols:JFX.PAL.thunder,power:1.8,shards:18,dome:true,arcs:7});
  castSnd((typeof audioSamples!=='undefined'&&audioSamples.thunderCastSample)?'thunderCastSample':'fireCastSample',.9,T.x,T.z);
  c.x=T.x;c.z=T.z;c.y=T.y;c.tx=T.x;c.tz=T.z;c.yaw=pwYawTo(player.x-T.x,player.z-T.z);                   // 瞬間移動（プレイヤーのほうを向いて出る）
  c.g.position.set(c.x,c.y,c.z);c.g.rotation.y=c.yaw-PEASANT_FLIP;
  shakeT=Math.max(shakeT||0,.3);shakeA=Math.max(shakeA||0,.1);
  if(!STAT.dead&&Math.hypot(player.x-T.x,player.z-T.z)<P.R&&Math.abs((player.gy!==undefined?player.gy:T.y)-T.y)<3)
    playerMagic(BOLT.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);
  B.fired=true;B.at=c.spT;
}
function gkBkRemove(n){const e=gkBk[n];scene.remove(e.ring);e.mat.dispose();gkBk.splice(n,1)}
function gkBlinkTick(dt){                                            // 着地点の輪・番人のまわりの火花（番人が倒れたり攻撃が止まったら消える）
  if(!gkBk.length)return;
  const P=GKA.BK;
  for(let n=gkBk.length-1;n>=0;n--){
    const e=gkBk[n],c=e.c,B=c.bk;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='blink'||!B||B.fired){gkBkRemove(n);continue}
    const t=c.spT,M=gkFlameMats(e.col);
    for(let k=0;k<3;k++)gkPart(e.el,c.x+(Math.random()-.5)*.9,c.y+.2+Math.random()*2,c.z+(Math.random()-.5)*.9,(Math.random()-.5)*3,(Math.random()-.2)*3,(Math.random()-.5)*3,.3,.08+Math.random()*.06,M);   // 番人の体にバチバチ火花
    if(!B.t||P.WIND<=0){e.ring.visible=false;continue}   // 予備動作なし（WIND=0）の時は、着地点の輪も出さない
    const gy=B.t.y,lock=t>=P.LOCK;
    e.ring.visible=true;e.ring.position.set(B.t.x,gy+.12,B.t.z);e.ring.scale.setScalar(P.R);
    e.mat.opacity=lock?.5+.4*Math.sin(t*45):.25+.15*Math.sin(t*12);                                  // 固まったら速く点滅して知らせる
    for(let k=0;k<2;k++){const a=Math.random()*6.283,r=P.R*Math.sqrt(Math.random());gkPart(e.el,B.t.x+Math.cos(a)*r,gy+.15,B.t.z+Math.sin(a)*r,0,1.5+Math.random()*2,0,.4,.08+Math.random()*.06,M)}
  }
}
// ---------- 追加属性の攻撃「前宙の飛び叩き」（軍人だけが抽選される・遠距離）: 剣を頭上に構えて、プレイヤーの方へ前宙しながら大きく飛び、着地と同時に剣を叩きつける。着地点は飛ぶ直前に固まる（この間に動けばよけられる）。当たると物理ダメージ＋その属性の追加効果。叩きつけた所から属性の粒が輪になって広がる ----------
// ---------- 追加属性の攻撃「火の棒の薙ぎ払い」（火の追加属性だけが抽選される・近距離）: 目の前に火をまとった長い棒を立てて（予告の扇形が地面に出る）、体の前で扇形にぶんと振り払う。振った範囲にいると火ダメージ＋火傷（扇の外へ離れればよけられる）。振った跡には炎の筋が残る ----------
GKA.FN={WIND:.5,SWING:.38,REC:.45,ARC:2.4,L:6.5,H:1.25,DMGK:1};   // WIND=棒を立てて構える秒（扇形の予告が出る）/ SWING=振る秒 / REC=消える秒 / ARC=扇の角度(rad・左右合計) / L=棒の長さ=攻撃の届く範囲(m・大きさ1のとき) / H=棒を持つ高さ(体の大きさ倍。棒は常に地面と水平で、この高さのまま変わらない) / DMGK=ダメージ（火のビームの威力に対する倍率）
const gkFn=[];let gkFnGeo=null;
function gkFanStart(c,el){
  const col=GKA_COL[el]||0xffffff,P=GKA.FN,z=Math.max(.8,c.size||1);
  if(!gkFnGeo){
    const N=18,pos=[0,0,0],idx=[];for(let i=0;i<=N;i++){const a=-P.ARC/2+P.ARC*i/N;pos.push(Math.sin(a),0,Math.cos(a))}for(let i=1;i<=N;i++)idx.push(0,i+1,i);
    const sec=new THREE.BufferGeometry();sec.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sec.setIndex(idx);
    gkFnGeo={staff:new THREE.CylinderGeometry(.07,.1,1,6).rotateX(Math.PI/2).translate(0,0,.5),glow:new THREE.CylinderGeometry(.24,.34,1,10,1,true).rotateX(Math.PI/2).translate(0,0,.5),sec};
  }
  const sm=new THREE.MeshBasicMaterial({color:0x3a2410}),gm=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.55,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide}),
        secm=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:gkBl(col),depthWrite:false,side:THREE.DoubleSide});
  const g=new THREE.Group();g.add(new THREE.Mesh(gkFnGeo.staff,sm));g.add(new THREE.Mesh(gkFnGeo.glow,gm));g.frustumCulled=false;g.scale.setScalar(.01);scene.add(g);
  const sec=new THREE.Mesh(gkFnGeo.sec,secm);sec.frustumCulled=false;scene.add(sec);
  gkFn.push({c,el,col,g,sec,sm,gm,secm,z,L:P.L*z,yaw0:null,py0:null,prev:null,hit:false,snd:false,end:false});
}
function gkFanStep(c){const P=GKA.FN;if(c.spT>=P.WIND+P.SWING+P.REC)gkAtkEnd(c)}
function gkFnRemove(n){const e=gkFn[n];scene.remove(e.g);scene.remove(e.sec);e.sm.dispose();e.gm.dispose();e.secm.dispose();gkFn.splice(n,1)}
function gkFanTick(dt){                                              // 棒・予告の扇・炎の粒・当たり判定（番人が倒れたり攻撃が止まったら消える）
  if(!gkFn.length)return;const P=GKA.FN;
  for(let n=gkFn.length-1;n>=0;n--){
    const e=gkFn[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='fan'){gkFnRemove(n);continue}
    const t=c.spT,z=e.z,L=e.L;if(t>=P.WIND&&e.yaw0===null)e.yaw0=c.yaw;   // 振り始めたら向きを固定（扇の位置が動かない）
    const yaw=e.yaw0===null?c.yaw:e.yaw0,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    const px=c.x+fx*.9*z,pz=c.z+fz*.9*z,py=(e.py0===null?(e.py0=c.y+P.H*z):e.py0),gy=Math.max(supportAt(c.x,c.z,c.y+.3),WATER);
    const sw=Math.max(0,Math.min(1,(t-P.WIND)/P.SWING)),ease=sw*sw*(3-2*sw),rec=Math.max(0,Math.min(1,(t-P.WIND-P.SWING)/P.REC));
    const s=Math.max(.01,t<P.WIND?pwSmooth(t/P.WIND):1-rec*rec),az=-P.ARC/2+P.ARC*ease,el=0;   // 棒は常に地面と水平（高さも固定）。構えは左端で水平に構え → 左から右へ水平に振る
    const ce=Math.cos(el),dx=(fx*Math.cos(az)+rx*Math.sin(az))*ce,dy=Math.sin(el),dz=(fz*Math.cos(az)+rz*Math.sin(az))*ce;
    e.g.position.set(px,py,pz);e.g.scale.set(s,s,s*L);e.g.lookAt(px+dx,py+dy,pz+dz);
    e.sec.position.set(px,gy+.1,pz);e.sec.rotation.y=yaw;e.sec.scale.setScalar(L);
    e.secm.opacity=(t<P.WIND?.1+.2*t/P.WIND:.28*(1-rec))*(.8+.2*Math.sin(t*40));   // 予告の扇形
    const w=(sw>0&&sw<1)?P.ARC/P.SWING*6*sw*(1-sw):0,tx=-fx*Math.sin(az)+rx*Math.cos(az),tz=-fz*Math.sin(az)+rz*Math.cos(az),hx=fx*Math.cos(az)+rx*Math.sin(az),hz=fz*Math.cos(az)+rz*Math.sin(az);
    for(let k=0;k<12;k++){if(Math.random()>s)continue;const r=Math.random()*L,v=w*r*.5;   // 棒にまとわりつく炎
      gkPart(e.el,px+dx*r,py+dy*r,pz+dz*r,tx*v,1+Math.random()*2.2,tz*v,.5,.15+Math.random()*.15,gkFlameMats(e.col))}
    if(sw>0&&sw<1)for(let k=0;k<10;k++){const r=L*(.3+Math.random()*.7),v=w*r*.3;   // 振った跡の地面に炎の筋が残る
      gkPart(e.el,px+hx*r,gy+.15,pz+hz*r,tx*v,1.5+Math.random()*2,tz*v,.8,.25+Math.random()*.2,gkFlameMats(e.col))}
    if(!e.snd&&t>=P.WIND){e.snd=true;castSnd('fireCastSample',.9,c.x,c.z)}
    if(!e.hit&&t>=P.WIND&&t<=P.WIND+P.SWING+.06&&!STAT.dead){const qx=player.x-px,qz=player.z-pz,d=Math.hypot(qx,qz),ang=Math.atan2(qx*rx+qz*rz,qx*fx+qz*fz),a0=e.prev===null?az:e.prev;   // 今フレームまでに棒が通った角度の中にいたら当たり
      if(d<L+.6&&ang>=Math.min(a0,az)-.14&&ang<=Math.max(a0,az)+.14&&Math.abs((player.y-.7)-py)<2.4){e.hit=true;playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);gkElemHit(e.el,c)}}
    e.prev=az;
    if(!e.end&&t>=P.WIND+P.SWING){e.end=true;JFX.impact(px+hx*L*.8,gy,pz+hz*L*.8,{cols:gkPal(e.el),power:1.2,shards:14,shake:false})}
  }
}
// ---------- 追加属性の攻撃「連続爆破」（爆破の追加属性だけが抽選される・遠距離）: 番人からプレイヤーに向かって、地面に赤い印が一直線に並ぶ。狙いが固まったあと、手前から順にプレイヤーのほうへ連続で爆発していく（爆発の輪の中にいるとダメージ＋爆破の追加効果。直線から外れればよけられる） ----------
GKA.CH={WIND:.7,LOCK:.5,GAP:.13,N:8,STEP:2.6,START:2.4,R:2.2,DMGK:1,TAIL:.5};   // WIND=印を出して狙う秒（LOCKで向きを固める）/ GAP=1つ爆発してから次までの秒 / N=爆発の数 / STEP=爆発の間隔(m) / START=番人から最初の爆発までの距離(m) / R=爆発の当たる半径(m) / DMGK=ダメージ（火のビームの威力に対する倍率）/ TAIL=最後の爆発のあとの隙(秒)
const gkCh=[];
function gkChainStart(c,el){
  const col=GKA_COL[el]||0xe01818,P=GKA.CH;if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),rings=[];
  for(let i=0;i<P.N;i++){const m=new THREE.Mesh(gkRingGeo,mat);m.rotation.x=-Math.PI/2;m.visible=false;m.frustumCulled=false;scene.add(m);rings.push(m)}
  gkCh.push({c,el,col,mat,rings,dx:0,dz:1,locked:false,fired:0,hit:false});
}
function gkChainStep(c){const P=GKA.CH;if(c.spT>=P.WIND+P.N*P.GAP+P.TAIL)gkAtkEnd(c)}
function gkChRemove(n){const e=gkCh[n];for(const m of e.rings)scene.remove(m);e.mat.dispose();gkCh.splice(n,1)}
function gkChainTick(dt){                                            // 印・連続爆破・当たり判定（番人が倒れたり攻撃が止まったら、残りは出さずに消える）
  if(!gkCh.length)return;const P=GKA.CH;
  for(let n=gkCh.length-1;n>=0;n--){
    const e=gkCh[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='chain'){gkChRemove(n);continue}
    const t=c.spT,gAt=(x,z)=>Math.max(supportAt(x,z,Math.max(c.y,player.gy)+.8),WATER);
    if(!e.locked){let dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz);if(d<1e-3){dx=Math.sin(c.yaw);dz=Math.cos(c.yaw);d=1}e.dx=dx/d;e.dz=dz/d;if(t>=P.LOCK)e.locked=true}   // 最初だけプレイヤーを追い、固まったら動けばよけられる
    e.mat.opacity=.6*(e.locked?.75+.25*Math.sin(t*40):1);
    for(let i=0;i<P.N;i++){const m=e.rings[i];if(i<e.fired){m.visible=false;continue}
      const d=P.START+i*P.STEP,x=c.x+e.dx*d,z=c.z+e.dz*d;m.visible=t>i*.045;m.position.set(x,gAt(x,z)+.12,z);m.scale.setScalar(P.R*(.75+.25*Math.min(1,t/P.WIND)))}
    while(e.fired<P.N&&t>=P.WIND+e.fired*P.GAP){
      const i=e.fired++,d=P.START+i*P.STEP,x=c.x+e.dx*d,z=c.z+e.dz*d,gy=gAt(x,z);
      hcBoomFx(x,gy+.4,z,P.R,true);castSnd('fireCastSample',.7,x,z);
      if(!e.hit&&!STAT.dead&&Math.hypot(player.x-x,player.z-z)<P.R+.5&&Math.abs((player.y-.7)-gy)<2.8){e.hit=true;playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);gkElemHit(e.el,c)}
    }
  }
}
// ---------- 追加属性の攻撃「光輪ビーム」（高エネルギーの追加属性だけが抽選される・遠距離）: 番人の背後に大きな光輪が開き、その輪の縁から何本ものビームを連続で撃つ。撃つ前に細い予告線が出て、狙いはその瞬間に固まる（予告線の間に動けばよけられる）。ビームが当たると高エネルギー属性のダメージ ----------
GKA.HL={WIND:1,GAP:.5,LEAD:.3,N:5,TAIL:.6,R:3.4,BACK:1.6,H:3.5,BLIFE:.2,BW:.4,HITR:.85,DMGK:.45};   // WIND=光輪が開く秒 / GAP=ビームを撃つ間隔(秒) / LEAD=予告線が出てから撃つまで(秒・この間に動けばよけられる) / N=ビームの本数 / TAIL=最後のビームのあとの隙(秒) / R=光輪の半径(m・大きさ1のとき) / BACK=番人の背後へずらす距離(m) / H=光輪の中心の高さ(体の大きさ倍) / BLIFE=ビームが見えている秒 / BW=ビームの太さ(m) / HITR=ビームに当たる半径(m) / DMGK=1本のダメージ（火のビームの威力に対する倍率）
const gkHl=[];let gkHlGeo=null;
function gkHaloStart(c,el){
  const P=GKA.HL,col=GKA_COL[el]||0xffe45a,z=Math.max(.8,c.size||1);
  if(!gkHlGeo){
    gkHlGeo={ring:new THREE.RingGeometry(.9,1,64),inner:new THREE.RingGeometry(.62,.66,64),disc:new THREE.CircleGeometry(.9,48),spike:new THREE.ConeGeometry(.05,.3,4).translate(0,1.15,0),bar:new THREE.CylinderGeometry(.5,.5,1,8).rotateX(Math.PI/2).translate(0,0,.5)};
  }
  const mk=(h,o)=>new THREE.MeshBasicMaterial({color:h,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const mats={ring:mk(col,0),inner:mk(0xffffff,0),disc:mk(col,0)},g=new THREE.Group(),spin=new THREE.Group(),inner=new THREE.Mesh(gkHlGeo.inner,mats.inner);
  spin.add(new THREE.Mesh(gkHlGeo.ring,mats.ring));
  for(let i=0;i<16;i++){const s=new THREE.Mesh(gkHlGeo.spike,mats.ring);s.rotation.z=i/16*Math.PI*2;spin.add(s)}
  const disc=new THREE.Mesh(gkHlGeo.disc,mats.disc);disc.position.z=-.02;
  g.add(disc);g.add(spin);g.add(inner);g.traverse(m=>{m.frustumCulled=false});g.scale.setScalar(.01);scene.add(g);
  gkHl.push({c,el,col,z,g,spin,inner,mats,shots:[],started:0,flash:0});
}
function gkHaloStep(c){const P=GKA.HL;if(c.spT>=P.WIND+(P.N-1)*P.GAP+P.LEAD+P.TAIL)gkAtkEnd(c)}
function gkHlShotFree(sh){for(const m of [sh.tel,sh.core,sh.glow])scene.remove(m);sh.telM.dispose();sh.coreM.dispose();sh.glowM.dispose()}
function gkHlRemove(n){const e=gkHl[n];scene.remove(e.g);for(const k in e.mats)e.mats[k].dispose();for(const sh of e.shots)if(!sh.done)gkHlShotFree(sh);gkHl.splice(n,1)}
function gkHaloTick(dt){                                              // 光輪・予告線・ビーム・当たり判定（番人が倒れたり攻撃が止まったら、残りは撃たずに消える）
  if(!gkHl.length)return;const P=GKA.HL;
  for(let n=gkHl.length-1;n>=0;n--){
    const e=gkHl[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='halo'){gkHlRemove(n);continue}
    const t=c.spT,z=e.z,yaw=c.yaw,fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),R=P.R*z,tEnd=P.WIND+(P.N-1)*P.GAP+P.LEAD+P.TAIL;
    const open=t<P.WIND?pwSmooth(t/P.WIND):1,fade=t>tEnd-P.TAIL?Math.max(0,(tEnd-t)/P.TAIL):1,s=Math.max(.01,open*fade);
    const cx=c.x-fx*P.BACK*z,cy=c.y+(c.jy||0)+P.H*z,cz=c.z-fz*P.BACK*z;
    e.flash=Math.max(0,e.flash-dt);
    e.g.position.set(cx,cy,cz);e.g.rotation.y=yaw;e.g.scale.setScalar(R*s*(1+e.flash*1.6));   // 光輪は番人の背後で、正面（番人の向き）を向く
    e.spin.rotation.z+=dt*.8;e.inner.rotation.z-=dt*1.6;
    const al=Math.min(1,open*1.5)*fade*(.88+.12*Math.sin(t*22));e.mats.ring.opacity=.9*al;e.mats.inner.opacity=.7*al;e.mats.disc.opacity=.16*al;
    while(e.started<P.N&&t>=P.WIND+e.started*P.GAP){                  // 予告線を出す: 輪の縁のどこかから、この瞬間のプレイヤーの位置へ（向きはここで固まる）
      const a=Math.random()*6.283,ox=cx+rx*Math.cos(a)*R*.9,oy=cy+Math.sin(a)*R*.9,oz=cz+rz*Math.cos(a)*R*.9,ty=player.y-.7;
      let dx=player.x-ox,dy=ty-oy,dz=player.z-oz;const d=Math.hypot(dx,dy,dz)||1;dx/=d;dy/=d;dz/=d;
      const mk=(h,o)=>new THREE.MeshBasicMaterial({color:h,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false}),k=new THREE.Color(e.col),w=new THREE.Color(0xffffff),
            telM=mk(e.col,0),coreM=mk(k.clone().lerp(w,.75),1),glowM=mk(e.col,.5),L=d+10,place=(m,wd)=>{m.position.set(ox,oy,oz);m.scale.set(wd,wd,L);m.lookAt(ox+dx,oy+dy,oz+dz);m.frustumCulled=false;scene.add(m);return m};
      const sh={ts:t,ox,oy,oz,dx,dy,dz,L,telM,coreM,glowM,fired:false,done:false,tf:0};
      sh.tel=place(new THREE.Mesh(gkHlGeo.bar,telM),.07);sh.core=place(new THREE.Mesh(gkHlGeo.bar,coreM),P.BW*.8);sh.glow=place(new THREE.Mesh(gkHlGeo.bar,glowM),P.BW*2.2);
      sh.core.visible=false;sh.glow.visible=false;e.shots.push(sh);e.started++}
    for(const sh of e.shots){
      if(sh.done)continue;
      if(!sh.fired){
        const u=Math.min(1,(t-sh.ts)/P.LEAD);sh.telM.opacity=(.25+.4*u)*fade*(.75+.25*Math.sin(t*60));
        if(t-sh.ts>=P.LEAD){                                          // 撃つ
          sh.fired=true;sh.tf=t;sh.tel.visible=false;sh.core.visible=true;sh.glow.visible=true;e.flash=.15;castSnd('fireCastSample',.8,c.x,c.z);
          const px=player.x-sh.ox,py=(player.y-.7)-sh.oy,pz=player.z-sh.oz,pr=Math.max(0,Math.min(sh.L,px*sh.dx+py*sh.dy+pz*sh.dz)),qx=px-sh.dx*pr,qy=py-sh.dy*pr,qz=pz-sh.dz*pr;
          if(!STAT.dead&&Math.hypot(qx,qy,qz)<P.HITR){playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);gkElemHit(e.el,c)}   // ビームの線の近くにいたら当たり
          let ix=sh.ox+sh.dx*(sh.L-10),iy=sh.oy+sh.dy*(sh.L-10),iz=sh.oz+sh.dz*(sh.L-10);   // 着弾（地面に向かうなら地面まで）
          if(sh.dy<-.05){const gy=gkGroundY(ix,iz),tg=(gy-sh.oy)/sh.dy;if(tg>0&&tg<sh.L){ix=sh.ox+sh.dx*tg;iy=gy;iz=sh.oz+sh.dz*tg}}
          JFX.impact(ix,iy,iz,{cols:gkPal(e.el),power:.9,shards:8,shake:false})}
      }else{
        const b=(t-sh.tf)/P.BLIFE;
        if(b>=1){gkHlShotFree(sh);sh.done=true;continue}
        sh.coreM.opacity=1-b;sh.glowM.opacity=.5*(1-b);sh.core.scale.x=sh.core.scale.y=P.BW*.8*(1-b*.6);sh.glow.scale.x=sh.glow.scale.y=P.BW*2.2*(1-b*.5);
      }
    }
  }
}
// ---------- 追加属性の攻撃「闇の乱舞」（軍人タイプで闇が追加属性になった時だけ抽選される・近くでも遠くでも使う）: 闇魔法を全身と剣に纏って、10秒間、剣を振り回しながら追いかける。遠いと飛んでくる。この間は魔法を使わず、こちらの魔法も効かない（物理攻撃は効く） ----------
GKA.FZ={T:10,SWING:1.8,WALKK:1.3,FLY:22,FLYD:7,LIFT:1.2,DMGK:.35};   // T=続く秒数 / SWING=剣を振る速さの倍率 / WALKK=近い時の追いかける速さの倍率 / FLY=遠い時に飛んでくる速さ(m/秒) / FLYD=この距離(m)より遠いと飛んで近づく / LIFT=飛ぶ時に浮く高さ(m) / DMGK=この間の剣1発のダメージ倍率（振る回数が多いので小さめ）
const gkFz=[];let gkFzGeo=null;
function gkFrenzyStart(c,el){
  const P=GKA.FZ,z=Math.max(.8,c.size||1);
  if(!gkFzGeo)gkFzGeo=new THREE.SphereGeometry(1,18,14);
  const mat=new THREE.MeshBasicMaterial({color:0x1a0a2a,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),mesh=new THREE.Mesh(gkFzGeo,mat);
  mesh.frustumCulled=false;scene.add(mesh);
  c.fz={fly:false,mana:c.mana};c.mana=0;                              // マナ0 = プレイヤーの魔法が全て効かない（元の値は終わったら戻す）
  c.swSpd=P.SWING;c.swDmgK=P.DMGK;c.fzLift=.001;c.fzLiftT=0;c.fzSpeed=0;
  gkFz.push({c,el,mat,mesh,z});
}
function gkFrenzyStep(c,dt){
  const P=GKA.FZ,F=c.fz;if(!F)return;
  if(c.spT>=P.T||STAT.dead){gkAtkEnd(c);return}
  const zd=Math.hypot(player.x-c.x,player.z-c.z);
  if(!(c.swT>=0)){c.swT=0;c.swHit=false;c.swSnd=false;c.swKind=Math.random()<.5?'side':'down'}   // 振り終わったらすぐ次を振る（叩きつけと横振りがランダム）
  c.swWait=0;
  if(zd>P.FLYD)F.fly=true;else if(zd<P.FLYD*.6)F.fly=false;
  let sp=0;
  if(F.fly){c.tx=player.x;c.tz=player.z;sp=golemWalk(c,dt,P.FLY)}   // 遠い: 飛んで近づく
  else if(zd>SSW.STOP){c.tx=player.x;c.tz=player.z;sp=golemWalk(c,dt,MAGE.CHASE*c.spdK*P.WALKK)}
  c.fzSpeed=sp;c.fzLiftT=F.fly?P.LIFT:0;
}
function gkFrenzyTick(dt){                                            // 闇のもやと粒（体・剣・飛んでいる時の尾）。攻撃が終わったら消える
  if(!gkFz.length)return;const col=GKA_COL.dark,M=gkFlameMats(col),v=new THREE.Vector3();
  for(let n=gkFz.length-1;n>=0;n--){
    const e=gkFz[n],c=e.c;
    if(!c.fz||c.dead!==undefined||c.hp<=0||!creatures.includes(c)){scene.remove(e.mesh);e.mat.dispose();gkFz.splice(n,1);continue}
    const z=e.z,t=c.t||0,by=c.y+(c.jy||0)+(c.fzLift||0);
    e.mesh.position.set(c.x,by+1.2*z,c.z);e.mesh.scale.set(1.6*z*(1+.05*Math.sin(t*9)),2.1*z,1.6*z*(1+.05*Math.sin(t*9)));e.mat.opacity=.3+.06*Math.sin(t*13);   // 全身を包む黒紫のもや
    for(let k=0;k<7;k++){const a=Math.random()*6.283,r=(.5+Math.random()*.9)*z;
      gkPart('dark',c.x+Math.cos(a)*r,by+Math.random()*2.6*z,c.z+Math.sin(a)*r,Math.cos(a)*1.2,1.2+Math.random()*2,Math.sin(a)*1.2,.7,.24*z,M)}
    const sw=c.G&&c.G.swH;if(sw){sw.updateWorldMatrix(true,false);for(let k=0;k<8;k++){v.set((Math.random()-.5)*.5,.3+Math.random()*2.6,(Math.random()-.5)*.5);sw.localToWorld(v);   // 剣の刃から闇が噴き出す
      gkPart('dark',v.x,v.y,v.z,(Math.random()-.5)*2,.5+Math.random()*1.5,(Math.random()-.5)*2,.6,.22*z,M)}}
    if(c.fz.fly)for(let k=0;k<8;k++){const a=Math.random()*6.283,r=Math.random()*.8*z;   // 飛んでいる間は、後ろに闇の尾を引く
      gkPart('dark',c.x+Math.cos(a)*r,by+(.4+Math.random()*1.8)*z,c.z+Math.sin(a)*r,0,.5+Math.random(),0,.9,.34*z,M)}
  }
}
// ---------- 追加属性の攻撃「大吹雪」（氷の追加属性だけが抽選される・近くでも遠くでも使う）: 番人を中心に、攻撃の届く距離いっぱいの巨大な吹雪を起こす。最初は地面の輪が広がるだけ（予告）で、そのあと吹雪の中にいる間は、一定間隔で氷ダメージ＋凍傷（最初の1回は凍結も）。吹雪の外へ出ればよけられる ----------
GKA.BZ={WIND:1.2,ACTIVE:5,FADE:.8,R:18,TICK:.5,DMGK:.22,H:9};   // WIND=輪が広がる予告の秒 / ACTIVE=吹雪が吹き荒れる秒 / FADE=収まる秒 / R=吹雪の半径(m・攻撃が届く距離と同じ) / TICK=ダメージの間隔(秒) / DMGK=1回のダメージ（火のビームの威力に対する倍率） / H=吹雪の高さ(m)
const gkBz=[];let gkBzGeo=null;
function gkBlizzardStart(c,el){
  const P=GKA.BZ;
  if(!gkBzGeo)gkBzGeo={disc:new THREE.CircleGeometry(1,64).rotateX(-Math.PI/2),dome:new THREE.SphereGeometry(1,28,12,0,Math.PI*2,0,Math.PI/2)};
  const mk=(h,o)=>new THREE.MeshBasicMaterial({color:h,transparent:true,opacity:o,depthWrite:false,side:THREE.DoubleSide}),
        dm=mk(0xbfe8ff,0),vm=mk(0xe8f8ff,0),disc=new THREE.Mesh(gkBzGeo.disc,dm),dome=new THREE.Mesh(gkBzGeo.dome,vm);
  disc.frustumCulled=false;dome.frustumCulled=false;disc.visible=false;dome.visible=false;scene.add(disc);scene.add(dome);
  gkBz.push({c,el,dm,vm,disc,dome,tick:0,froze:false});
  castSnd('fireCastSample',.9,c.x,c.z);
}
function gkBlizzardStep(c){const P=GKA.BZ;if(c.spT>=P.WIND+P.ACTIVE+P.FADE)gkAtkEnd(c)}
function gkBzRemove(n){const e=gkBz[n];scene.remove(e.disc);scene.remove(e.dome);e.dm.dispose();e.vm.dispose();gkBz.splice(n,1)}
function gkBlizzardTick(dt){                                          // 地面の輪・吹雪のもや・吹き荒れる雪・当たり判定（番人が倒れたり攻撃が止まったら消える）
  if(!gkBz.length)return;const P=GKA.BZ,M=gkFlameMats(GKA_COL.ice||0x9fdcff);
  for(let n=gkBz.length-1;n>=0;n--){
    const e=gkBz[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='blizzard'){gkBzRemove(n);continue}
    const t=c.spT,R=P.R,live=t>=P.WIND&&t<P.WIND+P.ACTIVE,fade=t>=P.WIND+P.ACTIVE?Math.max(0,1-(t-P.WIND-P.ACTIVE)/P.FADE):1,grow=Math.min(1,t/P.WIND),gy=Math.max(supportAt(c.x,c.z,c.y+.3),WATER);
    e.disc.visible=true;e.disc.position.set(c.x,gy+.12,c.z);e.disc.scale.set(R*grow,1,R*grow);e.dm.opacity=(live?.2+.05*Math.sin(t*9):t<P.WIND?.12+.12*grow:.2)*fade;   // 地面の輪（予告で広がり、吹雪の間は全体を覆う）
    e.dome.visible=t>=P.WIND*.6;e.dome.position.set(c.x,gy,c.z);e.dome.scale.set(R,P.H,R);e.vm.opacity=(live?.13+.03*Math.sin(t*5):t<P.WIND?.04:.13)*fade*Math.min(1,Math.max(0,(t-P.WIND*.6)/(P.WIND*.4)));   // 吹雪のもや（半球）
    if(t>=P.WIND*.5){const k=live?1:t<P.WIND?(t-P.WIND*.5)/(P.WIND*.5)*.6:fade*.6,N=Math.round(40*k);   // 雪が渦を巻いて吹き荒れる（番人を中心に回る・プレイヤーの近くにも多めに出す）
      for(let i=0;i<N;i++){let x,z;if(i%2&&!STAT.dead&&Math.hypot(player.x-c.x,player.z-c.z)<R){const a=Math.random()*6.283,r=Math.random()*9;x=player.x+Math.cos(a)*r;z=player.z+Math.sin(a)*r}else{const a=Math.random()*6.283,r=R*Math.sqrt(Math.random());x=c.x+Math.cos(a)*r;z=c.z+Math.sin(a)*r}
        const dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz)||1,sp=8+Math.random()*5;
        gkPart('ice',x,gy+.3+Math.random()*P.H*.8,z,-dz/d*sp-dx/d*1.5,-1-Math.random()*1.5,dx/d*sp-dz/d*1.5,.9,.2,M)}}
    if(live&&!STAT.dead){e.tick-=dt;
      if(e.tick<=0&&Math.hypot(player.x-c.x,player.z-c.z)<R&&Math.abs(player.y-c.y)<P.H+3){e.tick=P.TICK;   // 吹雪の中にいる間、一定間隔でダメージ＋凍傷（最初の1回だけ凍結も）
        playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);
        if(!e.froze){e.froze=true;gkElemHit(e.el,c)}else if(!SHIELD.blk&&playerManaPass()>0)applyPlayerFrostbite()}}
  }
}
// ---------- 追加属性の攻撃「結晶の波」（創造の追加属性だけが抽選される・近くでも遠くでも使う）: 番人の足元から、地面を這う結晶の波が輪になって外へ広がる。これを間隔をあけて何回か出す。波が通る瞬間に地面にいると当たる（ジャンプして足が地面から離れていれば、波の下をくぐってよけられる） ----------
GKA.CW={WIND:1,GAP:1,N:4,SPD:11,R:18,HW:1.2,JUMPH:.5,DMGK:.6,K:64};   // WIND=最初の溜め(秒) / GAP=波を出す間隔(秒) / N=波の数 / SPD=波の広がる速さ(m/秒) / R=波が届く距離(m) / HW=波の厚みの半分(m) / JUMPH=足がこの高さ(m)より上にあればよけられる / DMGK=1回のダメージ（火のビームの威力に対する倍率） / K=1つの波の結晶の数
const gkCw=[];let gkCwGeo=null;
function gkCrystalWaveStart(c,el){
  const P=GKA.CW,col=GKA_COL[el]||0x3a9bff;
  if(!gkCwGeo)gkCwGeo={cone:new THREE.ConeGeometry(.4,1.4,4).translate(0,.7,0),ring:new THREE.RingGeometry(.94,1,64).rotateX(-Math.PI/2)};
  const k=new THREE.Color(col),w=new THREE.Color(0xffffff),coneM=new THREE.MeshBasicMaterial({color:k.clone().lerp(w,.35)}),glowM=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const mark=new THREE.Mesh(gkCwGeo.ring,glowM);mark.frustumCulled=false;mark.visible=false;scene.add(mark);   // 溜めの間、足元で光る輪
  gkCw.push({c,el,col,coneM,glowM,mark,waves:[],started:0});
  castSnd('fireCastSample',.8,c.x,c.z);
}
function gkCrystalWaveStep(c){const P=GKA.CW;if(c.spT>=P.WIND+(P.N-1)*P.GAP+P.R/P.SPD+.3)gkAtkEnd(c)}
function gkCwWaveFree(w){for(const m of w.cones)scene.remove(m);scene.remove(w.ring);w.ringM.dispose()}
function gkCwRemove(n){const e=gkCw[n];for(const w of e.waves)if(!w.done)gkCwWaveFree(w);scene.remove(e.mark);e.coneM.dispose();e.glowM.dispose();gkCw.splice(n,1)}
function gkCrystalWaveTick(dt){                                       // 波・結晶・当たり判定（番人が倒れたり攻撃が止まったら、残りは出さずに消える）
  if(!gkCw.length)return;const P=GKA.CW;
  for(let n=gkCw.length-1;n>=0;n--){
    const e=gkCw[n],c=e.c;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='cwave'){gkCwRemove(n);continue}
    const t=c.spT,gy0=Math.max(supportAt(c.x,c.z,c.y+.3),WATER);
    e.mark.visible=t<P.WIND+.4;e.mark.position.set(c.x,gy0+.12,c.z);const ms=2+3*Math.min(1,t/P.WIND);e.mark.scale.set(ms,1,ms);e.glowM.opacity=Math.min(1,t/P.WIND)*.6*(.8+.2*Math.sin(t*25))*(t<P.WIND?1:Math.max(0,1-(t-P.WIND)/.4));
    while(e.started<P.N&&t>=P.WIND+e.started*P.GAP){                  // 波を1つ出す
      const ringM=new THREE.MeshBasicMaterial({color:e.col,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),ring=new THREE.Mesh(gkCwGeo.ring,ringM),cones=[],off=Math.random()*6.283,ph=[];
      ring.frustumCulled=false;scene.add(ring);
      for(let i=0;i<P.K;i++){const m=new THREE.Mesh(gkCwGeo.cone,e.coneM);m.frustumCulled=false;m.visible=false;scene.add(m);cones.push(m);ph.push([off+i/P.K*6.283+(Math.random()-.5)*.08,.6+Math.random()*.8,Math.random()*6.283])}
      e.waves.push({t0:t,cones,ph,ring,ringM,hit:false,done:false});e.started++;castSnd('fireCastSample',.7,c.x,c.z)}
    for(const w of e.waves){
      if(w.done)continue;
      const r=P.SPD*(t-w.t0);
      if(r>=P.R+2){gkCwWaveFree(w);w.done=true;continue}
      const env=Math.min(1,r/3)*Math.min(1,Math.max(0,(P.R+2-r)/4));   // 出始めと消える頃は小さく
      w.ring.position.set(c.x,gy0+.14,c.z);w.ring.scale.set(Math.max(.01,r),1,Math.max(.01,r));w.ringM.opacity=.55*env;
      for(let i=0;i<P.K;i++){const m=w.cones[i],q=w.ph[i],x=c.x+Math.cos(q[0])*r,z=c.z+Math.sin(q[0])*r;
        m.visible=r>1.2;m.position.set(x,Math.max(supportAt(x,z,c.y+2),WATER)-.05,z);const h=q[1]*(.7+.3*Math.sin(t*14+q[2]))*env*1.6;m.scale.set(.9*env+.1,Math.max(.01,h),.9*env+.1);m.rotation.y=q[2]}
      if(!w.hit&&!STAT.dead){const d=Math.hypot(player.x-c.x,player.z-c.z),feet=player.y-1.7-player.gy;   // 波の帯を通った瞬間に、足が地面についていれば当たり（ジャンプ中ならよけられる）
        if(Math.abs(d-r)<P.HW+P.SPD*dt*.5&&feet<P.JUMPH){w.hit=true;playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);gkElemHit(e.el,c)}}
    }
  }
}
// ---------- 組み合わせ攻撃（2つ以上の属性が重なった時だけ抽選される。各属性の攻撃とは別枠） ----------
// 番人が持つ属性が need をすべて含んでいたら候補に入る。「同じ条件（need が同じ）」の攻撃が複数ある時は、その中から1つだけ抽選。条件ごとに別々に抽選する。今は 創造(d)＋雷(thunder) の「結晶雷爆」だけ。
// 攻撃を増やす時: GKA.COMBO に {need,el,rng} を足し、gkAtkStart / gkAtkStep / tick に分岐を足す（結晶雷爆は gkCboltStart / gkCboltStep / gkCboltTick）。
GKA.COMBO={cbolt:{need:['d','thunder'],el:'thunder',rng:'any'}};   // 攻撃名: {need=必要な属性 / el=演出の主な属性 / rng=撃つ距離(short・long・any) / kd=この種類の番人だけ(省略=全員)}
GKA.COMBO_P=1;
GKA.BODY={TALL_P:.2,TALL:[1.3,1.55],TALL_W:1,WIDE_P:.2,WIDE:[1.35,1.7],WIDE_H:.15};   // 番人の体格の抽選。TALL_P=背が高い番人になる確率 / TALL=縦の倍率[最小,最大] / TALL_W=背が高い時に横が伸びる割合（縦の伸びの何割か。1=縦横同じ倍率＝引き伸ばさず単純に大きくする） / WIDE_P=横に大きい番人になる確率 / WIDE=横の倍率[最小,最大] / WIDE_H=横に大きい時に縦が伸びる割合（残りの確率＝ふつうの体格）
GKA.DECO={CAPE:.5,MANTLE:.35,SASH:.35,COLLAR:.3,STOLE:.3,BOOK:.3,HEAD:.35};   // 番人の装飾の抽選（それぞれ独立。全部外れると装飾なし）。CAPE=背中のマント / MANTLE=肩掛けケープ / SASH=腰の帯と垂れ布 / COLLAR=首の襟飾り / HEAD=頭の飾り（軍人=冠・角・光輪のどれか / 調査員=光輪）。布の色は1体ごとに1色、差し色は金
GKA.FRAME_P={lanky:.3,bulky:.3};   // キーパーの体格（頭以外）の確率。lanky=手足が長く、やや前屈みで膝を曲げる / bulky=上半身が太く、くびれと脚があり、膝を曲げて前屈み / 残り=脚がマントになったローブ。lanky・bulky は足があり、歩く時に足が動く
GKA.SOLDIER_CLOAK_P=.25;   // 軍人のキーパーが、肩から下までマントがかかって腕が見えない（長方形のシルエット）見た目になる確率。当たると片腕だけのマントは付かない
GKA.CLOAKARM_P=.25;   // キーパーが、片側だけ腕がマントで隠れた見た目になる確率
GKA.HEAD_P={funnel:.2,cone:.2,ring:.2};   // キーパーの頭の形の確率（funnel=上が広がったラッパ / cone=円錐 / ring=上が開いた太い輪。残り=菱形）。菱形以外の頭の調査員は、帽子をかぶらない
GKA.SUIT_P=1;   // ローブにならなかった時に、上着＋ズボンの服になる確率（全ての体格）。服も鎧も着ていない個体を無くすため、いまは使わず必ず着る
GKA.ARMOR_COL={   // 鎧の色の候補 [色, 重み, 名前]。通常=自然な金属の色 / 爆破の鎧=赤の濃淡 / 高エネルギーの鎧=白・銀・象牙の淡い色
  normal:[[0xa7aeb8,3,'鋼'],[0x6c7079,2,'暗い鉄'],[0x4a4d55,1,'黒ずんだ鉄'],[0x8d9bb0,1,'青みの鋼'],[0xd0d4dc,1,'白銀'],[0x9a7a45,1,'青銅'],[0xa4623a,.5,'銅'],[0x6f8a6a,.5,'緑青の青銅'],[0x7b5d46,1,'褐色の鉄']],
  blast:[[0xa8302a,3,'赤'],[0x8a2420,2,'暗い赤'],[0xa5482a,1,'赤錆'],[0x6a1c1a,1,'黒に近い赤']],
  holy:[[0xe2e6ee,3,'白'],[0xece4d0,2,'象牙'],[0xd5dbe6,1,'青みの銀'],[0xe6d9a8,.5,'淡い金']]};
function gkArmorColor(first,R){const L=GKA.ARMOR_COL[first==='e'?'blast':first==='a'?'holy':'normal'];let t=0;for(const c of L)t+=c[1];let r=R()*t;for(const c of L){r-=c[1];if(r<=0)return c[0]}return L[0][0]}   // 鎧の色を重みつきで1つ選ぶ（第一属性が爆破・高エネルギーの鎧は、その鎧の色の候補から）
GKA.GOLD_P=.35;   // 鎧に「金色の縁取り」が付く確率（縁取りの有無とは別に抽選。どの鎧でも付く）
GKA.PAT_P=.4;
GKA.HOLY_HELM_P=.5;   // 高エネルギーの鎧で兜をかぶる時に、後ろに扇形のアーチがつく専用の兜になる確率
GKA.HELM_P=.6;   // 全身鎧のキーパーの頭が、フルフェイスの兜（実質的に別の頭。色は鎧と同じ）になる確率   // 鎧に「表面の模様」が付く確率（金の縁取りとは別に抽選。模様は 縦の筋 / 山形 / 鋲 のどれか）
GKA.BULGE_P=.4;   // 鎧のうち「胸がやや飛び出た形の胴鎧」になる確率（残りは胴にぴったり沿う胴鎧）
GKA.ARMOR_P=.25;   // キーパーが「全身鎧」の服になる確率（全ての体格。ローブ・上着より先に抽選）
GKA.ROBE_P=.5;   // 体が細い・普通のキーパーが、調査員風のローブを着た見た目になる確率
GKA.HATLESS_P=.4;   // 調査員のゲートキーパーが、帽子をかぶっていない見た目になる確率（帽子なしの時は、顔の目の位置が上がり、頭の飾りの光輪も低い位置につく）
GKA.ARMS4_P=.35;   // ② キーパーの腕が4本になる確率（残り=2本）
GKA.STYLE={bare:{ch:2,p:1},staff:{ch:.5,p:1},sword:{ch:1,p:1},spear:{ch:1,p:1},axe:{ch:1,p:1},great:{ch:1,p:1},dual:{ch:1,p:1},quad:{ch:1,p:1}};   // spear=槍型（近接は槍の突き・魔法は槍を突き上げる・1秒・光は穂先。剣型と同じ軍人型の仕組みで、前宙・闇の乱舞・召喚など剣の動きの攻撃は抽選されない）
   // ③ 攻撃方法: bare=素手型（手を広げて魔法・溜め2秒・光は頭上）/ staff=杖型（杖を上げて溜めて振り下ろす・溜め0.5秒・光は杖の先）/ sword=片手剣型（近接は剣・魔法は剣を掲げたまま・1秒・光は剣先）。ch=魔法の溜め時間(秒) / p=出る確率の重み
GKA.SWING=.3;   // 杖を振り下ろす秒数
GKA.ARMLESS_P=.4;   // 調査員のゲートキーパーが、腕が一つもない見た目になる確率（魔法の光は空中に浮いた位置から出る）
GKA.BARRIER_P=.7;   // バリア（結界）の抽選: 高エネルギーの属性が付いた番人が、バリアを持つ確率（高エネルギーが付いていない番人は持たない）   // 条件を満たした時に、その組み合わせ攻撃を持つ確率（1=必ず持つ）
function gkPickCombos(attrs,kd){
  const have=new Set(attrs),groups=new Map();
  for(const t of Object.keys(GKA.COMBO)){const C=GKA.COMBO[t];if(!C.need.every(e=>have.has(e))||(C.kd&&C.kd!==kd))continue;
    const key=C.need.slice().sort().join('+');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
  const out=[];for(const l of groups.values())if(Math.random()<GKA.COMBO_P)out.push(l[Math.floor(Math.random()*l.length)]);
  return out;
}
// ---------- 組み合わせ攻撃「結晶雷爆」（創造＋雷・近くでも遠くでも使う）: 結晶をランダムな場所に何本も立て、番人が雷になって結晶から結晶へ瞬間移動しながら、1本ずつ爆破していく。爆破の少し前に、その結晶の足元に輪が出る（輪の外へ出ればよけられる）。近い時は番人のまわり、遠い時はプレイヤーのまわりに結晶を立てる ----------
GKA.CB={WIND:.9,WARN:.55,STEP:.7,REC:.6,R:3,DMGK:.9,H:26,NEAR:{N:5,R0:2.5,R1:7},FAR:{N:6,R0:2,R1:10}};   // WIND=結晶を立てる秒 / WARN=爆破の予告（輪）が出てから爆破するまで(秒) / STEP=次の結晶を爆破するまでの間隔(秒。予告は前の爆破と重なって連鎖する) / REC=最後の爆破のあとの隙(秒) / R=爆破の半径(m) / DMGK=1回のダメージ（雷の威力に対する倍率） / H=空から落ちる雷の高さ(m) / NEAR・FAR=近距離・遠距離の結晶の数(N)と、立てる範囲(R0〜R1 m。近距離は番人中心・遠距離はプレイヤー中心)
const gkCb=[];let gkCbGeo=null;
function gkCbSpot(cx,cz,ref,r0,r1,taken){                            // 結晶を立てられる場所（水の上・壁の中・高さが違いすぎる所・ほかの結晶の近くは避ける）。無ければ null
  for(let k=0;k<14;k++){
    const a=Math.random()*6.283,r=r0+Math.random()*(r1-r0),x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=Math.max(supportAt(x,z,ref+.3),WATER);
    if(y<=WATER+.05||Math.abs(y-ref)>2.5||solidAt(x,y+1,z)||solidAt(x,y+1.8,z))continue;
    let ok=true;for(const q of taken)if(Math.hypot(q.x-x,q.z-z)<2.2){ok=false;break}
    if(ok)return{x,z,y}}
  return null;
}
function gkCboltStart(c,ex){
  const P=GKA.CB,near=Math.hypot(player.x-c.x,player.z-c.z)<GKA.FAR,V=near?P.NEAR:P.FAR,   // 近い時は近距離版（番人のまわり）、遠い時は遠距離版（プレイヤーのまわり）
    cx=near?c.x:player.x,cz=near?c.z:player.z,ref=near?c.y:(player.gy!==undefined?player.gy:c.y),spots=[];
  for(let i=0;i<V.N;i++){const s=gkCbSpot(cx,cz,ref,V.R0,V.R1,spots);if(s)spots.push(s)}
  if(!spots.length){gkAtkEnd(c);return}                              // 立てられる所が無い: やめる
  if(!gkCbGeo)gkCbGeo={cone:new THREE.ConeGeometry(.35,1.6,5).translate(0,.8,0),ring:new THREE.RingGeometry(.94,1,48).rotateX(-Math.PI/2)};
  const col=GKA_COL.d,k=new THREE.Color(col),w=new THREE.Color(0xffffff),coneM=new THREE.MeshBasicMaterial({color:k.clone().lerp(w,.35)});
  const cr=spots.map(s=>{
    const g=new THREE.Group();
    for(const[px,pz,h,rx,rz] of [[0,0,1.3,0,0],[.28,.1,.8,.2,-.3],[-.25,-.12,.9,-.2,.25]]){const m=new THREE.Mesh(gkCbGeo.cone,coneM);m.frustumCulled=false;m.position.set(px,0,pz);m.scale.set(1,h,1);m.rotation.set(rx,0,rz);g.add(m)}
    g.position.set(s.x,s.y-1.4,s.z);g.rotation.y=Math.random()*6.283;g.visible=false;scene.add(g);
    const ringM=new THREE.MeshBasicMaterial({color:GKA_COL.thunder,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),ring=new THREE.Mesh(gkCbGeo.ring,ringM);
    ring.frustumCulled=false;ring.position.set(s.x,s.y+.12,s.z);ring.scale.setScalar(P.R);ring.visible=false;scene.add(ring);
    return{x:s.x,z:s.z,y:s.y,g,ring,ringM,st:0}});                  // st: 0=立っている / 1=爆破済み
  c.cb={near,cr,coneM,struck:0};gkCb.push({c,cb:c.cb});
  castSnd('fireCastSample',.8,c.x,c.z);
}
function gkCbBolt(a,b,wo,wc,life,seg,jit){                           // aからbへ走る角ばった稲妻（番人の瞬間移動・空から落ちる雷と同じ見た目）
  const pts=[a.clone()],len=a.distanceTo(b),dir=b.clone().sub(a).normalize(),Rr=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
  if(Rr.lengthSq()<1e-4)Rr.set(1,0,0);Rr.normalize();const U=new THREE.Vector3().crossVectors(Rr,dir).normalize();
  for(let i=1;i<=seg;i++){const t=i/seg,j=(i===seg?.2:jit)*(.4+Math.random()*.6);pts.push(a.clone().addScaledVector(dir,len*t).addScaledVector(Rr,(Math.random()-.5)*2*j).addScaledVector(U,(Math.random()-.5)*2*j))}
  const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
        mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),g=new THREE.Group();
  boltSegs(g,pts,wo,mOut);boltSegs(g,pts,wc,mCore);scene.add(g);bolts.push({g,mOut,mCore,t:0,mine:false,life});
}
function gkCbStrike(c,q){                                            // 雷になって結晶へ飛び、その結晶を爆破する。範囲内に（ほぼ同じ高さで）いたらダメージ
  const P=GKA.CB,ox=c.x,oy=c.y,oz=c.z;q.st=1;
  gkCbBolt(new THREE.Vector3(ox,oy+1.2,oz),new THREE.Vector3(q.x,q.y+1.2,q.z),.4,.12,.45,14,.7);                // 元の場所から結晶までの道すじ
  gkCbBolt(new THREE.Vector3(q.x,q.y+P.H,q.z),new THREE.Vector3(q.x,q.y+.4,q.z),.5,.16,.55,12,.9);              // 結晶に空から雷が落ちる
  fireBurst(ox,oy+1.2,oz,12,5);JFX.impact(ox,oy,oz,{cols:JFX.PAL.thunder,power:1,shards:8,arcs:3,shake:false});   // 出発点の火花
  c.x=q.x;c.z=q.z;c.y=q.y;c.tx=q.x;c.tz=q.z;c.yaw=pwYawTo(player.x-q.x,player.z-q.z);                           // 瞬間移動（プレイヤーのほうを向いて出る）
  c.g.position.set(c.x,c.y,c.z);c.g.rotation.y=c.yaw-PEASANT_FLIP;
  q.g.visible=false;q.ring.visible=false;                                                                         // 結晶が砕けて爆発
  JFX.impact(q.x,q.y,q.z,{cols:gkPal('d'),power:2.1,shards:24,dome:true,spikes:10,arcs:6});
  const M=gkFlameMats(GKA_COL.d);for(let i=0;i<18;i++){const a=Math.random()*6.283,sp=3+Math.random()*5;gkPart('d',q.x,q.y+.4+Math.random()*1.2,q.z,Math.cos(a)*sp,2+Math.random()*4,Math.sin(a)*sp,.5+Math.random()*.3,.1+Math.random()*.1,M)}
  fireBurst(q.x,q.y+.6,q.z,22,6);
  castSnd((typeof audioSamples!=='undefined'&&audioSamples.thunderCastSample)?'thunderCastSample':'fireCastSample',.9,q.x,q.z);
  shakeT=Math.max(shakeT||0,.3);shakeA=Math.max(shakeA||0,.1);
  if(!STAT.dead&&Math.hypot(player.x-q.x,player.z-q.z)<P.R&&Math.abs((player.gy!==undefined?player.gy:q.y)-q.y)<3)
    playerMagic(BOLT.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);
}
function gkCboltStep(c){                                             // 結晶を立てる → 順番に予告して爆破 → 少し隙
  const P=GKA.CB,B=c.cb;if(!B)return;
  while(B.struck<B.cr.length&&c.spT>=P.WIND+P.WARN+B.struck*P.STEP)gkCbStrike(c,B.cr[B.struck++]);   // 長いフレームでも飛ばさず順番に
  if(B.struck>=B.cr.length&&c.spT>=P.WIND+P.WARN+(B.cr.length-1)*P.STEP+P.REC){c.cb=null;gkAtkEnd(c)}
}
function gkCbFree(n){const e=gkCb[n];for(const q of e.cb.cr){scene.remove(q.g);scene.remove(q.ring);q.ringM.dispose()}e.cb.coneM.dispose();gkCb.splice(n,1)}
function gkCboltTick(dt){                                            // 結晶のせり上がり・予告の輪・火花（番人が倒れたり攻撃が止まったら、残りの結晶は消える）
  if(!gkCb.length)return;const P=GKA.CB;
  for(let n=gkCb.length-1;n>=0;n--){
    const e=gkCb[n],c=e.c,B=e.cb;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='cbolt'){gkCbFree(n);continue}
    const t=c.spT,M=gkFlameMats(GKA_COL.thunder);
    for(let i=0;i<B.cr.length;i++){
      const q=B.cr[i];if(q.st)continue;
      const ta=i*.1,u=Math.max(0,Math.min(1,(t-ta)/.25)),tw=P.WIND+i*P.STEP;
      q.g.visible=t>=ta;q.g.position.y=q.y-1.4*(1-u)*(1-u);          // 地面からせり上がる
      if(t>=tw){                                                     // 爆破の予告: 足元の輪が濃くなり、最後は速く点滅。結晶に雷の火花
        const p=Math.min(1,(t-tw)/P.WARN),s=1+.06*Math.sin(t*40);
        q.ring.visible=true;q.ringM.opacity=(.25+.45*p)*(p>.6?.6+.4*Math.sin(t*60):1);q.g.scale.set(s,1+.05*Math.sin(t*33),s);
        for(let k=0;k<2;k++)gkPart('thunder',q.x+(Math.random()-.5)*1.2,q.y+.3+Math.random()*1.6,q.z+(Math.random()-.5)*1.2,(Math.random()-.5)*3,(Math.random()-.2)*3,(Math.random()-.5)*3,.3,.07+Math.random()*.05,M)}
    }
  }
}
// ---------- 追加属性の攻撃「ドリル突進」（操作の追加属性だけが抽選される・遠距離）: 番人が真上へ飛び上がり、回転しながら操作のエフェクト（青緑の輪と渦）をドリルのように纏う。頭を相手に向けて狙いを固め（地面に印が出る）、回転したままプレイヤーのいた場所へ一直線に突っ込む。当たるとダメージ＋押し飛ばし（印から横へ動けばよけられる）。着地すると衝撃波が出て、少し隙ができる ----------
GKA.DR={WIND:.35,RISE:.55,HOVER:.45,SPD:30,REC:.7,H:5,HITR:1.5,DMGK:1.3,SPIN:20,HC:.9,KB:.6,MINDIST:3};   // WIND=しゃがんで構える秒 / RISE=飛び上がる秒 / HOVER=空中で回転しながら狙いを固めて待つ秒（この間に印から離れればよけられる） / SPD=突っ込む速さ(m/秒) / REC=着地後の隙(秒) / H=飛び上がる高さ(m。天井があれば低くなる) / HITR=当たる半径(m) / DMGK=ダメージ（火のビームの威力に対する倍率） / SPIN=回転の速さ(rad/秒) / HC=体の回転の中心の高さ（モデル座標） / KB=押し飛ばす強さ / MINDIST=突っ込む最短の距離(m。近すぎたら少し先まで)
const gkDr=[];let gkDrGeo=null;
const _drQ=new THREE.Quaternion(),_drQ2=new THREE.Quaternion(),_drV=new THREE.Vector3(),_drA=new THREE.Vector3(),_drU=new THREE.Vector3(),_drW=new THREE.Vector3(),_drX=new THREE.Vector3(1,0,0),_drY=new THREE.Vector3(0,1,0),_drZ=new THREE.Vector3(0,0,1);
function gkDrillStart(c,el){
  const P=GKA.DR,s=c.g.scale.y;let H=P.H;
  while(H>2&&solidAt(c.x,c.y+H+2*s,c.z))H-=.5;                       // 天井があったら低く
  if(solidAt(c.x,c.y+H+2*s,c.z)){gkAtkEnd(c);return}                 // 飛べない: やめる
  c.dr={ph:'wind',t:0,sx:c.x,sy:c.y,sz:c.z,H,spin:0,w:0,cx:c.x,cy:c.y+P.HC*s,cz:c.z,pitch:0,yaw:c.yaw,hit:false,tx:0,ty:0,tz:0,sx0:0,sy0:0,sz0:0,ex:0,ey:0,ez:0,dist:0,alpha:0,fade:1};
  if(!gkDrGeo)gkDrGeo={tor:new THREE.TorusGeometry(1,.07,6,28),ring:new THREE.RingGeometry(.86,1,40).rotateX(-Math.PI/2)};
  const col=GKA_COL.b,mk=()=>new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),
    ringM=mk(),markM=mk(),rings=[];
  for(let i=0;i<5;i++){const m=new THREE.Mesh(gkDrGeo.tor,ringM);m.frustumCulled=false;m.visible=false;scene.add(m);rings.push(m)}   // ドリルの輪（頭に近いほど小さい）
  const mark=new THREE.Mesh(gkDrGeo.ring,markM);mark.frustumCulled=false;mark.visible=false;scene.add(mark);                      // 突っ込む先の印
  gkDr.push({c,dr:c.dr,rings,ringM,mark,markM});
  castSnd('fireCastSample',.8,c.x,c.z);
}
function gkDrSegDist(px,py,pz,ax,ay,az,bx,by,bz){                   // 点と線分の距離
  const dx=bx-ax,dy=by-ay,dz=bz-az,l2=dx*dx+dy*dy+dz*dz;let t=l2>1e-6?((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/l2:0;t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-ax-dx*t,py-ay-dy*t,pz-az-dz*t);
}
function gkDrillQuat(D,out){                                         // 向き = 進む向き(Y) → 頭を進行方向へ倒す(X) → 体の軸まわりに回転(Y)
  out.setFromAxisAngle(_drY,D.yaw-PEASANT_FLIP);_drQ2.setFromAxisAngle(_drX,D.pitch);out.multiply(_drQ2);_drQ2.setFromAxisAngle(_drY,D.spin);out.multiply(_drQ2);return out;
}
function gkDrillApply(c){                                            // 体の中心(D.cx,cy,cz)を回転の中心にして、倒して回す
  const D=c.dr,g=c.g,s=g.scale.y;gkDrillQuat(D,_drQ);g.quaternion.copy(_drQ);
  _drV.set(0,GKA.DR.HC*s,0).applyQuaternion(_drQ);g.position.set(D.cx-_drV.x,D.cy-_drV.y,D.cz-_drV.z);
}
function gkDrillEnd(c){const D=c.dr;c.yaw=D.yaw;c.dr=null;c.g.rotation.set(0,c.yaw-PEASANT_FLIP,0);c.g.position.set(c.x,c.y,c.z);gkAtkEnd(c)}
function gkDrillStep(c,dt){
  const D=c.dr,P=GKA.DR;if(!D)return;D.t+=dt;const s=c.g.scale.y,hc=P.HC*s;
  if(D.ph==='wind'){                                                 // 構える（相手のほうを向く）
    D.yaw=pwYawTo(player.x-D.sx,player.z-D.sz);D.w=0;
    if(D.t>=P.WIND){D.ph='rise';D.t=0}
  }else if(D.ph==='rise'){                                           // 真上へ飛び上がりながら回り始める
    const u=Math.min(1,D.t/P.RISE);D.yaw=pwYawTo(player.x-D.sx,player.z-D.sz);
    D.cx=D.sx;D.cz=D.sz;D.cy=D.sy+hc+D.H*Math.sin(u*Math.PI/2);D.w=P.SPIN*.6*pwSmooth(u);
    if(u>=1){                                                        // 狙いを固める（プレイヤーのいる場所）
      const pgy=player.gy!==undefined?player.gy:D.sy;let tx=player.x,tz=player.z,dx=tx-D.sx,dz=tz-D.sz,dh=Math.hypot(dx,dz);
      if(dh<P.MINDIST){const a=dh>1e-3?Math.atan2(dz,dx):Math.random()*6.283;dx=Math.cos(a)*P.MINDIST;dz=Math.sin(a)*P.MINDIST;tx=D.sx+dx;tz=D.sz+dz;dh=P.MINDIST}
      let gy=Math.max(supportAt(tx,tz,pgy+.3),WATER);if(Math.abs(gy-pgy)>3)gy=pgy;
      D.tx=tx;D.ty=gy;D.tz=tz;D.sx0=D.cx;D.sy0=D.cy;D.sz0=D.cz;D.ex=tx;D.ey=gy+1;D.ez=tz;
      D.dist=Math.hypot(D.ex-D.sx0,D.ey-D.sy0,D.ez-D.sz0);D.alpha=Math.atan2(D.sy0-D.ey,dh);D.yaw=pwYawTo(dx,dz);D.ph='hover';D.t=0;
      castSnd('fireCastSample',.8,D.cx,D.cz)}
  }else if(D.ph==='hover'){                                          // 空中で回りながら、頭を相手のほうへ向ける
    const u=Math.min(1,D.t/P.HOVER);D.pitch=(Math.PI/2+D.alpha)*pwSmooth(u);D.w=P.SPIN*(.6+.4*pwSmooth(u));
    if(u>=1){D.ph='dive';D.t=0;D.px=D.cx;D.py=D.cy;D.pz=D.cz;castSnd('fireCastSample',1,D.cx,D.cz)}
  }else if(D.ph==='dive'){                                           // 回転したまま一直線に突っ込む
    const T=Math.max(.12,D.dist/P.SPD),u=Math.min(1,D.t/T),ox=D.cx,oy=D.cy,oz=D.cz;
    D.cx=D.sx0+(D.ex-D.sx0)*u;D.cy=D.sy0+(D.ey-D.sy0)*u;D.cz=D.sz0+(D.ez-D.sz0)*u;D.w=P.SPIN*1.4;D.pitch=Math.PI/2+D.alpha;
    if(!D.hit&&!STAT.dead&&gkDrSegDist(player.x,player.y-.85,player.z,ox,oy,oz,D.cx,D.cy,D.cz)<P.HITR){
      D.hit=true;playerMagic(BEAM.DMG*enemyPower(c)*P.DMGK*(c.dmgK===undefined?1:c.dmgK),c);gkElemHit('b',c);
      if(!STAT.dead&&typeof CREA!=='undefined'){const hx=D.ex-D.sx0,hz=D.ez-D.sz0,hd=Math.hypot(hx,hz)||1;player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=Math.max(player.kbv||0,CREA.KB_PL*P.KB);
        if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*P.KB}else player.vy=Math.max(player.vy,CREA.KB_PLUP*P.KB)}}   // 体当たり: ダメージ＋進む向きへ押し飛ばす
    if(u>=1){                                                        // 着地: 衝撃波
      D.ph='land';D.t=0;D.spin0=D.spin;D.spin1=Math.ceil(D.spin/6.283185)*6.283185;
      c.x=D.tx;c.z=D.tz;c.y=D.ty;c.tx=c.x;c.tz=c.z;
      try{JFX.impact(D.tx,D.ty,D.tz,{cols:gkPal('b'),power:1.9,shards:20,dome:true,spikes:10,shake:false})}catch(e){}
      const M=gkFlameMats(GKA_COL.b);for(let i=0;i<26;i++){const a=i/26*6.283,sp=4+Math.random()*4;gkPart('b',D.tx+Math.cos(a)*.8,D.ty+.15,D.tz+Math.sin(a)*.8,Math.cos(a)*sp,1+Math.random()*2.5,Math.sin(a)*sp,.45+Math.random()*.3,.1+Math.random()*.1,M)}
      for(let i=0;i<8;i++)addSmoke(D.tx+(Math.random()-.5)*2,D.ty+.2+Math.random()*.5,D.tz+(Math.random()-.5)*2,.3+Math.random()*.3,GOLEM.DUST);
      if(audioSamples.armorSample)playSample('armorSample',.7);shakeT=Math.max(shakeT||0,.3);shakeA=Math.max(shakeA||0,.1)}
  }else{                                                             // 着地後の隙: 起き上がって回転が止まる
    const u=Math.min(1,D.t/P.REC),e=pwSmooth(u);
    D.cx=D.tx;D.cz=D.tz;D.cy=D.ey+(D.ty+hc-D.ey)*e;D.pitch=(Math.PI/2+D.alpha)*(1-e);D.spin=D.spin0+(D.spin1-D.spin0)*e;D.w=0;D.fade=1-u;
    if(u>=1)gkDrillEnd(c);return;
  }
  D.spin+=D.w*dt;c.x=D.cx;c.z=D.cz;
}
function gkDrRemove(n){const e=gkDr[n];for(const m of e.rings)scene.remove(m);scene.remove(e.mark);e.ringM.dispose();e.markM.dispose();gkDr.splice(n,1)}
function gkDrillTick(dt){                                            // 操作のエフェクト: ドリルの輪・渦を巻く粒・突っ込む先の印（番人が倒れたり攻撃が止まったら消える）
  if(!gkDr.length)return;const P=GKA.DR;
  for(let n=gkDr.length-1;n>=0;n--){
    const e=gkDr[n],c=e.c,D=e.dr;
    if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='drill'||c.dr!==D){gkDrRemove(n);continue}
    const ph=D.ph,s=c.g.scale.y,M=gkFlameMats(GKA_COL.b);
    let on=ph==='rise'?Math.min(1,D.t/P.RISE):ph==='land'?D.fade:ph==='wind'?0:1;                      // 輪と渦の濃さ
    gkDrillQuat(D,_drQ);_drA.set(0,1,0).applyQuaternion(_drQ);                                         // 体の軸（頭の向き）
    _drU.crossVectors(_drA,Math.abs(_drA.z)<.9?_drZ:_drX).normalize();_drW.crossVectors(_drA,_drU);   // 軸に垂直な2方向
    e.ringM.opacity=.8*on;
    for(let i=0;i<e.rings.length;i++){const m=e.rings[i],h=(-.5+i*.5)*s,r=(1.15-i*.2)*s*(1+.08*Math.sin(D.t*30+i));
      m.visible=on>.02;m.position.set(D.cx+_drA.x*h,D.cy+_drA.y*h,D.cz+_drA.z*h);m.quaternion.setFromUnitVectors(_drZ,_drA);m.scale.setScalar(r)}
    if(on>.02){                                                                                         // 軸のまわりを渦巻く粒（頭に近いほど細い）
      for(let k=0;k<7;k++){const h=(-.9+Math.random()*2.5)*s,f=1-(h/s+.9)/3.4,ph0=D.spin*1.4+h*4+Math.random()*.4,r=(.3+.75*f)*s,co=Math.cos(ph0),si=Math.sin(ph0),
          px=_drU.x*co+_drW.x*si,py=_drU.y*co+_drW.y*si,pz=_drU.z*co+_drW.z*si,tv=7+(ph==='dive'?5:0);
        gkPart('b',D.cx+_drA.x*h+px*r,D.cy+_drA.y*h+py*r,D.cz+_drA.z*h+pz*r,(-_drU.x*si+_drW.x*co)*tv-_drA.x*(ph==='dive'?4:0),(-_drU.y*si+_drW.y*co)*tv-_drA.y*(ph==='dive'?4:0),(-_drU.z*si+_drW.z*co)*tv-_drA.z*(ph==='dive'?4:0),.3,.1+Math.random()*.06,M)}}
    if(ph==='hover'||ph==='dive'){                                                                      // 突っ込む先の印（固めたあと。速く点滅）
      e.mark.visible=true;e.mark.position.set(D.tx,D.ty+.12,D.tz);e.mark.scale.setScalar(P.HITR*1.15);
      e.markM.opacity=ph==='hover'?.3+.35*Math.sin(D.t*30)*.5+.2:.7;
      if(ph==='hover')for(let k=0;k<2;k++){const a=Math.random()*6.283,r=P.HITR*Math.sqrt(Math.random());gkPart('b',D.tx+Math.cos(a)*r,D.ty+.15,D.tz+Math.sin(a)*r,0,1.5+Math.random()*2,0,.4,.08+Math.random()*.05,M)}
    }else e.mark.visible=false;
  }
}
GKA.ONLY={flip:'soldier',frenzy:'soldier',summon:'soldier'};   // 特定の種類の番人だけが抽選される攻撃（攻撃名: 番人の種類）
GKA.FL={WIND:.25,REC:.5,LAND:2.2,HITR:3.2,DMG:SSW.ATK*1.2,TBASE:.4,TK:.025,TMIN:.45,TMAX:.75,H0:2,HK:.08,HMAX:4,HC:.9,SLASHAT:.78,RING:1.8,RN:8,RLIFE:.35,FLIPS:1};   // WIND=構える秒（この間は相手を追う） / REC=着地後の隙(秒) / LAND=相手の何m手前に降りるか / HITR=叩きつけて当たる半径(m) / DMG=物理ダメージ / TBASE,TK,TMIN,TMAX=飛んでいる秒数（距離で伸びる） / H0,HK,HMAX=跳ぶ高さ(m) / HC=体の回転の中心の高さ（モデル座標） / SLASHAT=飛んでいる間のどこで振り下ろすか(0〜1) / RING=宙返りで描く円の半径(体の大きさ倍) / RN=1フレームに出す粒の数 / RLIFE=粒が残る秒数 / FLIPS=前宙の回数（1=1回転）
GKA.ONLY_EL={vortex:'fire',fan:'fire',blink:'thunder',chain:'e',halo:'a',frenzy:'dark',blizzard:'ice',cwave:'d',drill:'b',summon:'c',hurl:'b'};   // 特定の属性の時だけ抽選される攻撃（攻撃名: 属性）。火の渦は火が追加属性になった時だけ
GKA.SPECIAL_W=3;   // 属性・タイプ特有の攻撃（ONLY / ONLY_EL にある攻撃）が抽選される重み（ふつうの攻撃は1）。大きいほど特有の攻撃が選ばれやすい
GKA.SPEC_P=.7;   // 属性特有の攻撃（ONLY_EL）が、その属性の「ふつうの攻撃」とは別に追加される確率（属性ごとに1回抽選）。1にすると、その属性がついたら必ず持つ
function gkPickSpecial(el,used=new Set(),kd){const sp=GKA.TYPES.filter(t=>GKA.ONLY_EL[t]===el&&(!GKA.ONLY[t]||GKA.ONLY[t]===kd)&&!used.has(t));return sp.length&&Math.random()<GKA.SPEC_P?sp[Math.floor(Math.random()*sp.length)]:null}   // 属性特有の攻撃。既に選ばれた攻撃は候補から除外
function gkPickAtk(kd,el,used=new Set()){const ok=GKA.TYPES.filter(t=>!GKA.ONLY_EL[t]&&(!GKA.ONLY[t]||GKA.ONLY[t]===kd)&&!used.has(t));if(!ok.length)return null;const w=ok.map(t=>GKA.ONLY[t]?GKA.SPECIAL_W:1);let r=Math.random()*w.reduce((a,b)=>a+b,0);for(let i=0;i<ok.length;i++){r-=w[i];if(r<0)return ok[i]}return ok[ok.length-1]}   // 重み付き抽選。候補切れなら null
// ---------- 追加属性の攻撃「部下の召喚」（軍人タイプ×支配の追加属性だけが抽選される・距離を問わない）: 番人のまわりに紫の印と光の柱が出て、CAST秒後に部下の軍人が数人現れる。部下は最初から敵対していて、番人が呼べる数にはMAXの上限がある ----------
GKA.SM={N:[3,4],CAST:1,R:[3,5.5],MAX:6,CD:10,RANGE:1e9,RING:1.4,FADE:.7,H:3.5};   // N=一度に呼ぶ人数[最少,最多] / CAST=印が出てから部下が現れるまで(秒) / R=番人から部下が出る距離(m)[最短,最長] / MAX=同時に生きていられる部下の数（これ以上は呼ばない） / CD=次に呼べるまでの秒数 / RANGE=撃てる距離(m。距離を問わないので大きな値) / RING=印の半径(m) / FADE=現れたあと印と柱が消える秒 / H=光の柱の高さ(m)
const gkSm=[];let gkSmPillar=null;
function gkSummonCount(c){let n=0;if(c.minions)for(const m of c.minions)if(m.hp>0&&m.dead===undefined)n++;return n}
function gkSummonStart(c,el){
  const P=GKA.SM,col=GKA_COL[el]||0xc040ff;if(!gkRingGeo)gkRingGeo=new THREE.RingGeometry(.86,1,40);
  if(!gkSmPillar)gkSmPillar=new THREE.CylinderGeometry(.55,.55,P.H,16,1,true);
  const n=P.N[0]+Math.floor(Math.random()*(P.N[1]-P.N[0]+1)),spots=[],room=Math.max(0,P.MAX-gkSummonCount(c));
  for(let i=0;i<n*8&&spots.length<Math.min(n,room);i++){
    const a=Math.random()*6.283,r=P.R[0]+Math.random()*(P.R[1]-P.R[0]),x=c.x+Math.sin(a)*r,z=c.z+Math.cos(a)*r,h=heightAt(x,z);
    if(!(h>=WATER+.2)||waterDepthAt(x,z,h)>.35)continue;
    const y=supportAt(x,z,h);if(Math.abs(y-c.y)>3||solidAt(x,y+1,z)||solidAt(x,y+2,z))continue;
    if(spots.some(q=>Math.hypot(q.x-x,q.z-z)<1.8))continue;
    spots.push({x,z,y})}
  if(!spots.length){c.smNext=c.t+2;gkAtkEnd(c);return}   // 出られる所が無い: やめる
  const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),
        pmat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  for(const q of spots){
    q.ring=new THREE.Mesh(gkRingGeo,mat);q.ring.rotation.x=-Math.PI/2;q.ring.position.set(q.x,q.y+.1,q.z);q.ring.frustumCulled=false;scene.add(q.ring);
    q.pil=new THREE.Mesh(gkSmPillar,pmat);q.pil.position.set(q.x,q.y+P.H/2,q.z);q.pil.frustumCulled=false;scene.add(q.pil)}
  const e={c,spots,mat,pmat,fired:false,ft:0};c.sm=e;gkSm.push(e);
}
function gkSummonStep(c){
  const P=GKA.SM,e=c.sm;if(!e){gkAtkEnd(c);return}
  if(c.spT<P.CAST||e.fired)return;
  e.fired=true;c.smNext=c.t+P.CD;if(!c.minions)c.minions=[];
  for(const q of e.spots){
    spawnMage({x:q.x,z:q.z},'soldier');
    const m=creatures[creatures.length-1];
    if(m&&m.kind==='soldier'&&!m.gk){m.hostile=true;m.swWait=.7+Math.random()*.4;m.minionOf=c;c.minions.push(m)}}
  castSnd('fireCastSample',.7,c.x,c.z);c.cnT=.3;gkAtkEnd(c);                // 部下が現れたら腕を下ろして、次の攻撃まで待つ
}
function gkSmRemove(n){const e=gkSm[n];for(const q of e.spots){scene.remove(q.ring);scene.remove(q.pil)}e.mat.dispose();e.pmat.dispose();if(e.c.sm===e)e.c.sm=null;gkSm.splice(n,1)}
function gkSummonTick(dt){                                           // 印と光の柱（番人が倒れたり攻撃が止まったら、部下が出る前なら何も出さずに消える）
  if(!gkSm.length)return;const P=GKA.SM;
  for(let n=gkSm.length-1;n>=0;n--){
    const e=gkSm[n],c=e.c;
    if(!e.fired){
      if(c.spT<0||c.dead!==undefined||c.hp<=0||!creatures.includes(c)||!c.spAtk||c.spAtk.atk!=='summon'){gkSmRemove(n);continue}
      const t=c.spT,k=Math.min(1,t/P.CAST);
      e.mat.opacity=.6*(.65+.35*Math.sin(t*26));e.pmat.opacity=.1+.3*k;
      for(const q of e.spots){q.ring.scale.setScalar(P.RING*(.6+.4*k));q.pil.scale.set(.6+.4*k,1,.6+.4*k)}
    }else{
      e.ft+=dt;const k=e.ft/P.FADE;if(k>=1){gkSmRemove(n);continue}
      e.mat.opacity=.8*(1-k);e.pmat.opacity=.75*(1-k);
      for(const q of e.spots){q.ring.scale.setScalar(P.RING*(1+1.3*k));q.pil.scale.set(1+.6*k,1,1+.6*k)}
    }}
}
// ---------- 追加属性の攻撃「掴んで投げる」（操作の追加属性だけが抽選される・遠距離）: 番人の近くにいる生き物を念力で掴んで頭上へ持ち上げ、プレイヤーめがけて投げつける。生き物がいなければ、念力の衝撃でプレイヤーをただ吹き飛ばす。掴む・飛ぶ・着地の動きはプレイヤーの操作魔法（c.lev / lvFly）と同じ ----------
GKA.HU={GRAB_R:12,HOLD:1.1,REC:.35,SPEED:28,HITR:1,H:3.4,FWD:1.4,DMG:SSW.ATK*.9,KB:1.1,PDMGK:.7,PKB:1.4,FX:.25};   // GRAB_R=掴める生き物の範囲（番人から・m。動物は掴まない） / HOLD=掴んで頭上に構える秒（この間は相手を向く。投げる向きは離す瞬間に固まる） / REC=投げたあとの隙(秒) / SPEED=投げる速さ(m/秒) / HITR=飛んでくる生き物がプレイヤーに当たる半径(m) / H=持ち上げる高さ（番人の大きさ倍） / FWD=相手の方へずらす量(m) / DMG=当たった時の物理ダメージ（盾では防げない） / KB=当たった時の吹き飛ばし倍率 / PDMGK,PKB=生き物がいない時の衝撃のダメージ（火のビームの威力に対する倍率）・吹き飛ばし倍率 / FX=衝撃のビームが見える秒
const gkHu=[];let gkHuGeo=null;
function gkHuBeam(m,A,B,r){const M=_gkHuV.copy(A).add(B).multiplyScalar(.5),len=A.distanceTo(B)||.01;m.position.copy(M);m.lookAt(B);m.scale.set(r,r,len)}
const _gkHuV=new THREE.Vector3();
function gkHurlStart(c,el){
  const P=GKA.HU,col=GKA_COL.b||0x3de0c0;
  if(!gkHuGeo){gkHuGeo=new THREE.CylinderGeometry(1,1,1,8,1,true);gkHuGeo.rotateX(Math.PI/2)}
  let v=null,bd=P.GRAB_R;                                            // いちばん近い生き物（動物・ゲートキーパー・すでに浮いているものは除く）
  for(const o of creatures){
    if(o===c||o.hp<=0||o.dead!==undefined||o.lev||o.gk||o.rider||isAnimal(o)||Math.abs(o.y-c.y)>6)continue;
    const d=Math.hypot(o.x-c.x,o.z-c.z);if(d<bd){bd=d;v=o}}
  if(v){
    const sz=v.size||1,aura=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(aura);
    v.lev={mode:'hold',t:0,p:new THREE.Vector3(v.x,v.y+(v.jy||0)+sz*(v.hy||.95),v.z),aura,byGk:c};v.jy=0;v.jv=0;v.kv=0;v.foe=null}
  const mk=(o)=>new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const orb=new THREE.Mesh(creaSphere,mk(.5)),beam=new THREE.Mesh(gkHuGeo,mk(.55));
  orb.frustumCulled=false;beam.frustumCulled=false;beam.visible=false;scene.add(orb);scene.add(beam);
  gkHu.push({c,v,orb,beam,thrown:false,fx:0,age:0,pp:null,A:new THREE.Vector3(),B:new THREE.Vector3()});c.hu=gkHu[gkHu.length-1];
  castSnd('fireCastSample',.6,c.x,c.z);
}
function gkHurlStep(c){
  const P=GKA.HU,e=c.hu;if(!e){gkAtkEnd(c);return}
  if(!e.thrown&&c.spT>=P.HOLD)gkHurlRelease(c,e);
  if(e.thrown&&c.spT>=P.HOLD+P.REC)gkAtkEnd(c);
}
function gkHurlRelease(c,e){
  const P=GKA.HU,v=e.v;e.thrown=true;e.age=0;
  const handY=c.y+(c.jy||0)+(c.size||1)*1.5;
  if(v&&lvAlive(v)&&v.lev&&v.lev.byGk===c){                          // 掴んでいる生き物を、プレイヤーめがけて投げる（弾道の落ち分を見込んで狙う）
    const L=v.lev,t=new THREE.Vector3(player.x-L.p.x,player.y-.6-L.p.y,player.z-L.p.z),T=t.length()/P.SPEED;
    t.y+=.5*LCTRL.GRAV*T*T;t.normalize();
    L.mode='fly';L.t=0;L.vx=t.x*P.SPEED;L.vy=t.y*P.SPEED;L.vz=t.z*P.SPEED;L.hit=[c];L.rx=0;L.pHit=false;   // hit に番人を入れておく（自分に当たらない）
    v.yaw=pwYawTo(L.vx,L.vz);v.amp=1;v.posed=true;lvFly.push(v);e.pp=L.p.clone();
    for(let i=0;i<16;i++)addWaterPart(L.p.x,L.p.y,L.p.z,t.x*8+(Math.random()-.5)*4,t.y*8+(Math.random()-.5)*4,t.z*8+(Math.random()-.5)*4,.35,.07+Math.random()*.05,0,lvMats);
  }else{                                                             // 生き物がいない: 念力の衝撃でプレイヤーをただ吹き飛ばす
    if(v&&v.lev&&v.lev.byGk===c)lvEnd(v,0,0,0);e.v=null;
    e.A.set(c.x,handY,c.z);e.B.set(player.x,player.y-.6,player.z);
    let len=e.A.distanceTo(e.B),blocked=false;const n=Math.ceil(len/.6);
    for(let i=1;i<n;i++){const k=i/n;if(solidAt(e.A.x+(e.B.x-e.A.x)*k,e.A.y+(e.B.y-e.A.y)*k,e.A.z+(e.B.z-e.A.z)*k)){blocked=true;e.B.set(e.A.x+(e.B.x-e.A.x)*k,e.A.y+(e.B.y-e.A.y)*k,e.A.z+(e.B.z-e.A.z)*k);break}}   // 壁に遮られたらそこまで
    e.fx=P.FX;
    if(!blocked&&!STAT.dead&&len<GKA.RANGE+2){
      playerMagic(BEAM.DMG*enemyPower(c)*P.PDMGK*(c.dmgK===undefined?1:c.dmgK),c);
      if(!STAT.dead&&!SHIELD.blk&&playerManaPass()>0&&typeof CREA!=='undefined'){const hx=player.x-c.x,hz=player.z-c.z,hd=Math.hypot(hx,hz)||1;
        player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=Math.max(player.kbv||0,CREA.KB_PL*P.PKB);player.stunT=Math.max(player.stunT||0,HURT_KB.STUN);
        if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*P.PKB}else player.vy=Math.max(player.vy,CREA.KB_PLUP*P.PKB)}}
  }
  castSnd('fireCastSample',.8,c.x,c.z);c.cnT=.3;
}
function gkHuRemove(n,drop){
  const e=gkHu[n],c=e.c;
  if(drop&&e.v&&e.v.lev&&e.v.lev.mode==='hold'&&e.v.lev.byGk===c)lvEnd(e.v,0,0,0);   // 途中でやめた・番人が倒れた: 掴んでいた生き物は落ちる
  scene.remove(e.orb);scene.remove(e.beam);e.orb.material.dispose();e.beam.material.dispose();
  if(c.hu===e)c.hu=null;gkHu.splice(n,1);
}
function gkHurlTick(dt){                                             // 掴んでいる間の動き・投げた生き物がプレイヤーに当たる判定・光の演出
  if(!gkHu.length)return;const P=GKA.HU;
  for(let n=gkHu.length-1;n>=0;n--){
    const e=gkHu[n],c=e.c;let v=e.v;e.age+=dt;
    if(!e.thrown){
      if(c.hp<=0||c.dead!==undefined||!creatures.includes(c)||c.spT<0||!c.spAtk||c.spAtk.atk!=='hurl'){gkHuRemove(n,true);continue}
      if(v&&!(lvAlive(v)&&v.lev&&v.lev.byGk===c)){if(v.lev&&v.lev.byGk===c)lvEnd(v,0,0,0);v=e.v=null}   // 掴まれている間に倒された
      let dx=player.x-c.x,dz=player.z-c.z;const dd=Math.hypot(dx,dz)||1;dx/=dd;dz/=dd;
      const hy=c.y+(c.jy||0)+(c.size||1)*P.H,hx=c.x+dx*P.FWD,hz=c.z+dz*P.FWD,k=Math.min(1,c.spT/P.HOLD);
      e.orb.visible=true;e.orb.position.set(hx,hy,hz);e.orb.scale.setScalar((.25+.35*k)*(c.size||1)*(1+.12*Math.sin(e.age*40)));e.orb.material.opacity=.35+.4*k;
      if(v){
        const L=v.lev,sz=v.size||1,kk=Math.min(1,dt*7);L.t+=dt;
        L.p.x+=(hx-L.p.x)*kk;L.p.y+=(hy-L.p.y)*kk;L.p.z+=(hz-L.p.z)*kk;
        const gy=supportAt(L.p.x,L.p.z,L.p.y-sz*.95);if(L.p.y<gy+sz*.95+.15)L.p.y=gy+sz*.95+.15;
        v.y=gy;v.yaw=pwYawTo(player.x-L.p.x,player.z-L.p.z);v.amp=1;v.phase+=dt*16;pwPose(v);v.posed=true;
        lvPlace(v,L.p,Math.sin(L.t*5)*.12,Math.sin(L.t*4.1)*.15);
        if(L.aura){L.aura.position.copy(L.p);L.aura.scale.setScalar(sz*(.85+.06*Math.sin(L.t*8)))}
        e.A.set(c.x,c.y+(c.jy||0)+(c.size||1)*1.5,c.z);e.beam.visible=true;gkHuBeam(e.beam,e.A,L.p,.07+.03*Math.sin(e.age*50));e.beam.material.opacity=.3+.4*k;   // 番人の手から、掴んだ生き物へ念力の線
      }else e.beam.visible=false;
    }else{
      e.orb.visible=false;
      if(e.fx>0){e.fx-=dt;e.beam.visible=e.fx>0;if(e.fx>0){gkHuBeam(e.beam,e.A,e.B,.22*(e.fx/P.FX)+.04);e.beam.material.opacity=.8*(e.fx/P.FX)}}else e.beam.visible=false;
      if(v&&lvAlive(v)&&v.lev&&v.lev.mode==='fly'){
        const L=v.lev;
        if(!L.pHit&&!STAT.dead){
          const pp=e.pp||L.p,d=gkDrSegDist(player.x,player.y-.7,player.z,pp.x,pp.y,pp.z,L.p.x,L.p.y,L.p.z);
          if(d<P.HITR+.3*(v.size||1)){
            L.pHit=true;const sp=Math.hypot(L.vx,L.vz)||1,ux=L.vx/sp,uz=L.vz/sp;
            playerPhys(P.DMG*(c.dmgK===undefined?1:c.dmgK),c);   // 投げられた生き物は物理で当たる（光のシールドでは防げない）
            if(!STAT.dead&&typeof CREA!=='undefined'){player.kbx=ux;player.kbz=uz;player.kbv=Math.max(player.kbv||0,CREA.KB_PL*P.KB);player.stunT=Math.max(player.stunT||0,HURT_KB.STUN);
              if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*P.KB}else player.vy=Math.max(player.vy,CREA.KB_PLUP*P.KB)}
            magicHit(v,LCTRL.SELF_DMG,player.x,player.z,{ignoreMana:true,noAlarm:true});   // ぶつかった生き物もダメージを受けて、跳ね返る
            L.vx*=.3;L.vz*=.3;L.vy=Math.max(L.vy,3);
            for(let i=0;i<14;i++)addFirePart(L.p.x,L.p.y,L.p.z,(Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*8,.3+Math.random()*.3,.06+Math.random()*.06,lvMats);
          }
          e.pp=L.p.clone();
        }
        if(e.age<8)continue;                                         // 飛んでいる間は残す（着地・時間切れは updateLevit が片づける）
      }
      if(e.fx<=0||!e.v)if(!(v&&lvAlive(v)&&v.lev&&v.lev.mode==='fly')&&e.fx<=0){gkHuRemove(n,false);continue}
      if(e.age>=8){gkHuRemove(n,false);continue}
    }
  }
}
const _gkFl=new THREE.Vector3();
function gkFlipEnd(c){c.fl=null;c.g.rotation.x=0;gkAtkEnd(c)}
function gkFlipStep(c,dt){
  const F=c.fl,P=GKA.FL;if(!F)return;F.t+=dt;
  if(F.ph==='wind'){
    if(F.t>=P.WIND){                                                 // 着地点を固めて、飛ぶ
      const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz)||1,land=Math.max(0,d-P.LAND);
      F.sx=c.x;F.sz=c.z;F.tx=c.x+dx/d*land;F.tz=c.z+dz/d*land;
      const gyL=Math.max(supportAt(F.tx,F.tz,c.y+.3),WATER);
      if(land<2||Math.abs(gyL-c.y)>3){gkFlipEnd(c);return}           // 近すぎる・高さが違いすぎる: やめる
      c.yaw=pwYawTo(dx,dz);F.T=Math.max(P.TMIN,Math.min(P.TMAX,P.TBASE+land*P.TK));F.H=Math.min(P.HMAX,P.H0+land*P.HK);F.ph='air';F.t=0;F.slash=false;
      if(typeof swingSound==='function')swingSound({id:'sword'},0);
    }
  }else if(F.ph==='air'){
    const u=Math.min(1,F.t/F.T);c.x=F.sx+(F.tx-F.sx)*u;c.z=F.sz+(F.tz-F.sz)*u;
    if(!F.slash&&u>=P.SLASHAT){F.slash=true;if(typeof swingSound==='function')swingSound({id:'sword'},0)}   // 振り下ろす音
    gkFlipRing(c,u);                                                 // 宙返りの間、体のまわりに属性の粒で縦の円を描く
    if(u>=1){F.ph='land';F.t=0;gkFlipImpact(c)}
  }else if(F.t>=P.REC)gkFlipEnd(c);
}
function gkFlipRing(c,u){                                            // 体の中心を通る縦の円（進む向き×上下の面）。正面から見ると縦線・横から見ると円。体の回転に合わせて、回った分だけ弧が伸びて、1周で輪になる。粒は体と同じ速さで動くので、円は体についてくる
  const F=c.fl,P=GKA.FL,el=c.spAtk.el,M=gkFlameMats(GKA_COL[el]||0xffffff),s=c.g.scale.y,R=P.RING*s;
  let hx=F.tx-F.sx,hz=F.tz-F.sz;const hd=Math.hypot(hx,hz)||1;hx/=hd;hz/=hd;
  const cx=c.x,cy=c.y+P.HC*s+4*F.H*u*(1-u),cz=c.z,rx=Math.PI*2*P.FLIPS*pwSmooth(u);
  const vx=(F.tx-F.sx)/F.T,vz=(F.tz-F.sz)/F.T,vy=4*F.H*(1-2*u)/F.T;   // 体の進む速さ
  for(let i=0;i<P.RN;i++){
    const a=i<P.RN-2?Math.random()*rx:rx-Math.random()*.3,th=Math.PI/2-a,cs=Math.cos(th)*R,sn=Math.sin(th)*R;   // 弧のどこか（2個は先頭＝頭の位置）
    gkPart(el,cx+hx*cs,cy+sn,cz+hz*cs,vx,vy,vz,P.RLIFE*(.8+Math.random()*.4),.1+Math.random()*.08,M)}
}
function gkFlipApply(c){                                             // 体を腰を中心に前へ1回転させ、放物線の上を通す（回転の中心が飛んだ道すじに乗る）
  const F=c.fl,P=GKA.FL,g=c.g;g.rotation.order='YXZ';
  let jump=0,rx=0;if(F.ph==='air'){const u=Math.min(1,F.t/F.T);jump=4*F.H*u*(1-u);rx=Math.PI*2*P.FLIPS*pwSmooth(u)}
  g.rotation.y=c.yaw-PEASANT_FLIP;g.rotation.x=rx;g.rotation.z=0;
  const s=g.scale.y,v=_gkFl.set(0,P.HC,0).applyEuler(g.rotation).multiplyScalar(s);
  g.position.set(c.x-v.x,c.y+P.HC*s+jump-v.y,c.z-v.z);
}
function gkFlipImpact(c){try{JFX.impact(c.x,c.y,c.z,{cols:gkPal(c.spAtk&&c.spAtk.el),power:1.6,shards:16,spikes:8,dome:true,shake:false})}catch(e){}                                            // 着地して叩きつけた: 土煙と属性の粒・揺れ。近くにいたら物理ダメージ＋属性の追加効果
  const P=GKA.FL,el=c.spAtk.el,col=GKA_COL[el]||0xffffff,x=c.x,z=c.z,y=Math.max(supportAt(x,z,c.y+.3),WATER);
  for(let i=0;i<10;i++)addSmoke(x+(Math.random()-.5)*2,y+.2+Math.random()*.5,z+(Math.random()-.5)*2,.3+Math.random()*.3,GOLEM.DUST);
  for(let i=0;i<28;i++){const a=i/28*6.283,sp=4+Math.random()*3;gkPart(el,x+Math.cos(a)*.8,y+.15,z+Math.sin(a)*.8,Math.cos(a)*sp,1+Math.random()*2,Math.sin(a)*sp,.4+Math.random()*.3,.1+Math.random()*.1,gkFlameMats(col))}
  if(audioSamples.armorSample)playSample('armorSample',.7);
  shakeT=Math.max(shakeT||0,.3);shakeA=Math.max(shakeA||0,.1);
  if(!STAT.dead&&Math.hypot(player.x-x,player.z-z)<P.HITR&&Math.abs((player.gy!==undefined?player.gy:y)-y)<2.5){
    playerPhys(P.DMG,c);SHIELD.blk=false;if(!shieldAbsorb(0))gkElemHit(el,c)}
}
function makeGkSpear(headColor){   // ゲートキーパーの槍: 細い丸い柄（石突き・革を巻いた握り）＋金具（ソケット・柄に沿う添え金・縛り紐）＋薄い木の葉形の穂先（中央に稜線）。柄の下端が0、穂先の先が上端1.98（makeSpear と同じ長さ・向き）。槍型の槍は横(x,z)だけ SPR.WIDE 倍に引き伸ばされるので、中の箱を 1/WIDE にして太く見えないようにしている
  const g=new THREE.Group(),inn=new THREE.Group();inn.scale.set(1/SPR.WIDE,1,1/SPR.WIDE);g.add(inn);
  const M=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true,side:THREE.DoubleSide}),wood=M(0x7a5a38),iron=M(0x6f757d),brass=M(0x9c8650),leather=M(0x3a2a1c),cord=M(0x7a2a22),gripM=M(0x5e4630);
  const part=(geo,mat,y,x)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y,0);inn.add(m);return m};
  part(new THREE.CylinderGeometry(.02,.02,1.55,8),wood,.775);   // 柄（細い丸棒）
  part(new THREE.CylinderGeometry(.027,.02,.1,8),iron,.05);part(new THREE.CylinderGeometry(.03,.03,.014,8),brass,.105);   // 石突き（鉄）と真鍮の輪
  part(new THREE.CylinderGeometry(.024,.024,.3,8),leather,.5);for(const y of[.38,.44,.5,.56,.62])part(new THREE.CylinderGeometry(.028,.028,.01,8),gripM,y);   // 握り: 革の巻き＋巻き目
  for(const sx of[-1,1])part(new THREE.BoxGeometry(.008,.26,.03),iron,1.4,sx*.024);   // 添え金（穂先の根元から柄に沿って下へ）
  for(const y of[1.46,1.49])part(new THREE.CylinderGeometry(.025,.025,.012,8),cord,y);   // 縛り紐（赤茶）
  part(new THREE.CylinderGeometry(.042,.026,.16,8),iron,1.56);part(new THREE.CylinderGeometry(.036,.036,.016,8),brass,1.644);   // ソケット（上へ少し広がる）と真鍮の輪
  const ST=[1.62,1.68,1.74,1.82,1.9,1.98],W=[.045,.078,.085,.07,.04,0],T=[.012,.016,.016,.013,.008,0],hc=new THREE.Color(headColor===undefined?0xb0b6bd:headColor),lt=hc.clone().lerp(new THREE.Color(0xffffff),.35),dk=hc.clone().multiplyScalar(.8),CL=[lt,dk,dk,lt],pos=[],col=[];   // 穂先: 高さごとの半幅・半厚（葉形）。断面はひし形（中央が稜線）で、4面を明暗に塗り分ける
  const ring=i=>[[-W[i],0],[0,T[i]],[W[i],0],[0,-T[i]]];
  for(let s=0;s<ST.length-1;s++){const A=ring(s),B=ring(s+1);
    for(let i=0;i<4;i++){const j=(i+1)%4,a=[A[i][0],ST[s],A[i][1]],b=[A[j][0],ST[s],A[j][1]],c=[B[i][0],ST[s+1],B[i][1]],d=[B[j][0],ST[s+1],B[j][1]];
      pos.push(...a,...c,...b,...b,...c,...d);for(let k=0;k<6;k++)col.push(CL[i].r,CL[i].g,CL[i].b)}}
  const hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));hg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));hg.computeVertexNormals();
  inn.add(new THREE.Mesh(hg,new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true,side:THREE.DoubleSide})));   // 穂先（材質の色は白＝属性の色づけがそのまま寄る）
  return g;
}
function makeGkAxe(){   // ゲートキーパーの戦闘斧: 太い木の柄（革を巻いた握り・鉄の石突き）＋鉄の頭（左右に三日月形の刃を持つ両刃・上に短い穂先・真鍮の輪）。柄の下端が0、頭の中心が1.55、上端2.0。横(x,z)だけ AXE.WIDE 倍に引き伸ばされるので、中の箱を 1/WIDE にして太く見えないようにしている。両刃なので、刃の向き（寝かせ具合）が変わっても見た目が崩れない
  const g=new THREE.Group(),inn=new THREE.Group();inn.scale.set(1/AXE.WIDE,1,1/AXE.WIDE);g.add(inn);
  const M=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true,side:THREE.DoubleSide}),wood=M(0x6b4a2e),iron=M(0x6f757d),brass=M(0x9c8650),leather=M(0x3a2a1c),gripM=M(0x5e4630);
  const part=(geo,mat,y,x)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y,0);inn.add(m);return m};
  part(new THREE.CylinderGeometry(.034,.034,1.7,8),wood,.85);   // 柄
  part(new THREE.CylinderGeometry(.04,.034,.12,8),iron,.06);part(new THREE.CylinderGeometry(.045,.045,.016,8),brass,.12);   // 石突き
  part(new THREE.CylinderGeometry(.04,.04,.34,8),leather,.5);for(const y of[.38,.45,.52,.59,.66])part(new THREE.CylinderGeometry(.044,.044,.01,8),gripM,y);   // 握り: 革の巻き＋巻き目
  part(new THREE.BoxGeometry(.13,.3,.1),iron,1.55);   // 頭の芯（柄が通る金具）
  for(const y of[1.36,1.74])part(new THREE.CylinderGeometry(.05,.05,.02,8),brass,y);   // 真鍮の輪
  const sh=new THREE.Shape();sh.moveTo(.05,.13);sh.quadraticCurveTo(.2,.2,.33,.4);sh.quadraticCurveTo(.46,0,.33,-.4);sh.quadraticCurveTo(.2,-.2,.05,-.13);sh.lineTo(.05,.13);   // 刃の輪郭: 外側へふくらむ三日月（刃先は外の縁）
  const bg=new THREE.ExtrudeGeometry(sh,{depth:.035,bevelEnabled:false,curveSegments:8});bg.translate(0,0,-.0175);
  const cp=bg.attributes.position,cc=[],lt=new THREE.Color(0xeef2f6),dk=new THREE.Color(0x7d848d),tmp=new THREE.Color();
  for(let i=0;i<cp.count;i++){tmp.copy(dk).lerp(lt,Math.max(0,Math.min(1,(cp.getX(i)-.05)/.34)));cc.push(tmp.r,tmp.g,tmp.b)}   // 刃の色: 根もと=暗い鋼 → 刃先=明るい鋼（頂点の色。材質は白なので属性の色づけがそのまま寄る）
  bg.setAttribute('color',new THREE.Float32BufferAttribute(cc,3));
  const bm=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true,side:THREE.DoubleSide});
  const b1=new THREE.Mesh(bg,bm);b1.position.set(0,1.55,0);inn.add(b1);
  const bg2=bg.clone();bg2.scale(-1,1,1);const b2=new THREE.Mesh(bg2,bm);b2.position.set(0,1.55,0);inn.add(b2);   // 反対側の刃
  const tp=new THREE.ConeGeometry(.05,.3,4);tp.rotateY(Math.PI/4);part(tp,iron,1.85);   // 頭の上の穂先
  return g;
}
function makeGkSword(){   // ゲートキーパーの剣: 薄い刃（断面は縁を削った六角形・中ほどに浅い溝・先へ細くなる）＋反った細い鍔＋革を巻いた握り＋丸い柄頭。柄頭が下端0、切っ先が上端1.5（makeSword と同じ長さ・向き）。ゲートキーパーの剣は横(x,z)だけ SSW.WIDE 倍に引き伸ばされるので、中の箱を 1/WIDE にして厚みが太く見えないようにしている
  const g=new THREE.Group(),inn=new THREE.Group();inn.scale.set(1/SSW.WIDE,1,1/SSW.WIDE);g.add(inn);
  const M=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true,side:THREE.DoubleSide}),iron=M(0x7d848d),brass=M(0x9c8650),leather=M(0x3a2a1c),grip=M(0x5e4630);
  const bm=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true,side:THREE.DoubleSide});   // 刃: 色は頂点ごと（縁=明るい鋼 / 面=鋼 / 溝=暗い鋼）。属性の色づけは材質の色が白なので、そのまま寄る
  const ST=[.33,.45,.6,1.15,1.3,1.38,1.5],bw=y=>y>=1.5?0:.048-.018*(y-.33)/1.05,bt=y=>y>=1.5?0:.011-.004*(y-.33)/1.05,fw=y=>y<=.45?0:y<.6?(y-.45)/.15:y<=1.15?1:y<1.3?(1.3-y)/.15:0;   // 各高さの 半幅・半厚・溝の深さの割合
  const ring=y=>{const w=bw(y),t=bt(y),tg=t*(1-.6*fw(y));return[[-w,0],[-.6*w,t],[-.2*w,t],[0,tg],[.2*w,t],[.6*w,t],[w,0],[.6*w,-t],[.2*w,-t],[0,-tg],[-.2*w,-t],[-.6*w,-t]]};   // 断面の12点（前の面→後ろの面を一周）
  const SC=[0xeef2f6,0xbcc3cb,0x8e969f,0x8e969f,0xbcc3cb,0xeef2f6,0xeef2f6,0xbcc3cb,0x8e969f,0x8e969f,0xbcc3cb,0xeef2f6],pos=[],col=[],cc=new THREE.Color();   // 辺ごとの色: 縁(削った面) / 面 / 溝の壁
  for(let s=0;s<ST.length-1;s++){const A=ring(ST[s]),B=ring(ST[s+1]);
    for(let i=0;i<12;i++){const j=(i+1)%12,a=[A[i][0],ST[s],A[i][1]],b=[A[j][0],ST[s],A[j][1]],c=[B[i][0],ST[s+1],B[i][1]],d=[B[j][0],ST[s+1],B[j][1]];
      pos.push(...a,...c,...b,...b,...c,...d);cc.set(SC[i]);for(let k=0;k<6;k++)col.push(cc.r,cc.g,cc.b)}}
  const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));bg.computeVertexNormals();inn.add(new THREE.Mesh(bg,bm));
  const part=(geo,mat,y)=>{const m=new THREE.Mesh(geo,mat);m.position.y=y;inn.add(m);return m};
  const pom=new THREE.SphereGeometry(.042,7,5);pom.scale(1,.85,1);part(pom,iron,.045);   // 柄頭（丸い）
  part(new THREE.CylinderGeometry(.034,.034,.016,6),brass,.075);   // 柄頭と握りの間の真鍮の輪
  part(new THREE.CylinderGeometry(.024,.028,.2,6),grip,.17);   // 握り（細め・下ほど少し太い）
  for(const y of[.11,.17,.23])part(new THREE.CylinderGeometry(.031,.031,.012,6),leather,y);   // 革の巻き目
  part(new THREE.BoxGeometry(.075,.06,.045),iron,.3);   // 鍔の中心
  const qs=new THREE.Shape();[[.03,-.028],[.115,-.022],[.16,.006],[.15,.03],[.106,.004],[.03,.028]].forEach(([x,y],i)=>i?qs.lineTo(x,y):qs.moveTo(x,y));   // 鍔の腕: 先が刃のほうへ少し反った細い形
  const qg=new THREE.ExtrudeGeometry(qs,{depth:.028,bevelEnabled:false});qg.translate(0,0,-.014);
  for(const sx of[1,-1]){const q=part(qg,iron,.3);q.scale.x=sx}
  part(new THREE.BoxGeometry(.11,.028,.03),brass,.348);   // 刃の根元の金具（はばき）
  return g;
}
function makeGkGreat(){   // ゲートキーパーの大剣: 幅広で分厚い長い刃（断面は縁を削った六角形・中ほどに太い溝・根元から先端近くまで幅が変わらず、先で一気に尖る）＋太い一文字の鍔＋革を巻いた長めの握り＋大きな柄頭。柄頭が下端0、切っ先が上端1.5。横(x,z)だけ GSW.WIDE 倍に引き伸ばされるので、中の箱を 1/WIDE にして厚みが太く見えないようにしている（makeGkSword と同じ作り）
  const g=new THREE.Group(),inn=new THREE.Group();inn.scale.set(1/GSW.WIDE,1,1/GSW.WIDE);g.add(inn);
  const M=c=>new THREE.MeshLambertMaterial({color:c,flatShading:true,side:THREE.DoubleSide}),iron=M(0x6c737c),brass=M(0x9c8650),leather=M(0x32241a),grip=M(0x54402c);
  const bm=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true,side:THREE.DoubleSide});   // 刃: 色は頂点ごと（縁=明るい鋼 / 面=鋼 / 溝=暗い鋼）。属性の色づけは材質の色が白なので、そのまま寄る
  const ST=[.36,.5,.7,1.1,1.28,1.4,1.5],bw=y=>y>=1.5?0:y<=1.28?.082-.012*(y-.36)/.92:.07*(1.5-y)/.22,bt=y=>y>=1.5?0:y<=1.28?.017-.004*(y-.36)/.92:.013*(1.5-y)/.22,fw=y=>y<=.5?0:y<.7?(y-.5)/.2:y<=1.1?1:y<1.28?(1.28-y)/.18:0;   // 各高さの 半幅・半厚・溝の深さの割合
  const ring=y=>{const w=bw(y),t=bt(y),tg=t*(1-.55*fw(y));return[[-w,0],[-.6*w,t],[-.2*w,t],[0,tg],[.2*w,t],[.6*w,t],[w,0],[.6*w,-t],[.2*w,-t],[0,-tg],[-.2*w,-t],[-.6*w,-t]]};
  const SC=[0xeef2f6,0xbcc3cb,0x8e969f,0x8e969f,0xbcc3cb,0xeef2f6,0xeef2f6,0xbcc3cb,0x8e969f,0x8e969f,0xbcc3cb,0xeef2f6],pos=[],col=[],cc=new THREE.Color();
  for(let s=0;s<ST.length-1;s++){const A=ring(ST[s]),B=ring(ST[s+1]);
    for(let i=0;i<12;i++){const j=(i+1)%12,a=[A[i][0],ST[s],A[i][1]],b=[A[j][0],ST[s],A[j][1]],c=[B[i][0],ST[s+1],B[i][1]],d=[B[j][0],ST[s+1],B[j][1]];
      pos.push(...a,...c,...b,...b,...c,...d);cc.set(SC[i]);for(let k=0;k<6;k++)col.push(cc.r,cc.g,cc.b)}}
  const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));bg.computeVertexNormals();inn.add(new THREE.Mesh(bg,bm));
  const part=(geo,mat,y)=>{const m=new THREE.Mesh(geo,mat);m.position.y=y;inn.add(m);return m};
  const pom=new THREE.SphereGeometry(.06,7,5);pom.scale(1,.85,1);part(pom,iron,.05);   // 柄頭（大きく丸い）
  part(new THREE.CylinderGeometry(.045,.045,.02,6),brass,.09);   // 柄頭と握りの間の真鍮の輪
  part(new THREE.CylinderGeometry(.028,.032,.24,6),grip,.22);   // 握り（長め）
  for(const y of[.14,.21,.28])part(new THREE.CylinderGeometry(.036,.036,.014,6),leather,y);   // 革の巻き目
  part(new THREE.BoxGeometry(.09,.07,.06),iron,.37);   // 鍔の中心
  part(new THREE.BoxGeometry(.4,.045,.05),iron,.37);   // 一文字の鍔（左右へまっすぐ）
  for(const sx of[1,-1]){part(new THREE.BoxGeometry(.03,.09,.06),brass,.37).position.x=sx*.2}   // 鍔の両端の真鍮の留め
  part(new THREE.BoxGeometry(.18,.034,.04),brass,.415);   // 刃の根元の金具（はばき）
  return g;
}

const gkHud=document.getElementById('gkHud'),gkAttrsEl=document.getElementById('gkAttrs'),gkHpFill=document.getElementById('gkHpFill'),gkHpText=document.getElementById('gkHpText');
const GK_ATTR_NAMES={fire:'火',ice:'氷',thunder:'雷',water:'水',dark:'闇',a:'爆発',b:'制御',c:'支配',d:'創造',e:'爆破',z:'融合'};
let gkHudOwner=null,gkHudAttrKey='',gkHudScanAt=0,gkHudHpKey='',gkHudShown=false;
function gkHudPick(){                                                  // 生きているゲートキーパーのうち、プレイヤーに最も近いもの（配列を作らずに探す）
  let c=null,best=Infinity;
  for(let i=0;i<creatures.length;i++){const q=creatures[i];if(!q.gk||q.hp<=0||q.dead!==undefined)continue;
    const dx=q.x-player.x,dz=q.z-player.z,d=dx*dx+dz*dz;if(d<best){best=d;c=q}}
  return c;
}
function updateGatekeeperHud(){
  // 重さ対策: 表示するゲートキーパーの探し直しは0.25秒ごと / 体力・属性の表示は、値が変わった時だけ書き換える（毎フレーム書くと、属性が多いほどHUDの描き直しが重くなる）
  const now=performance.now();let c=gkHudOwner;
  if(!c||c.hp<=0||c.dead!==undefined||!c.g||!c.g.parent||now>=gkHudScanAt){gkHudScanAt=now+250;c=gkHudPick()}
  if(!c){if(gkHudShown){gkHud.style.display='none';gkHudShown=false}gkHudOwner=null;return}
  const attrs=c.gkAttributes||[];
  if(c!==gkHudOwner){                                                  // 表示する相手が変わった時だけ、属性の表示を作り直す
    const key=attrs.join('|');
    if(key!==gkHudAttrKey||c!==gkHudOwner){
      gkAttrsEl.replaceChildren();
      attrs.forEach((a,i)=>{
        const e=document.createElement('span');e.className='gkAttr';
        e.textContent=(GK_ATTR_NAMES[a]||a)+' '+(i+1);
        e.title='属性 '+(i+1);gkAttrsEl.appendChild(e);
      });
      gkHudAttrKey=key;
    }
    gkHudOwner=c;gkHudHpKey='';
  }
  const max=Math.max(1,c.maxHp||c.hp||1),hp=Math.max(0,c.hp||0),hpI=Math.ceil(hp);
  if(hpI!==gkHudHpKey){                                                // 体力が変わった時だけ書く
    gkHudHpKey=hpI;
    gkHpFill.style.width=(Math.max(0,Math.min(1,hp/max))*100)+'%';
    gkHpText.textContent=hpI+' / '+max;
  }
  if(!gkHudShown){gkHud.style.display='block';gkHudShown=true}
}

// ===== index.html から移動: ゲートキーパーの属性（GKA_COL）を、index.html 側の表へ足す。表は magic.js にあるので、magic.js が無い時（EMAG が無い）は何もしない =====
if(typeof EMAG!=='undefined'&&typeof PCOL!=='undefined'&&typeof emMat!=='undefined'){
{const A=THREE.AdditiveBlending,mk=(c,o,add)=>emMk(c,o,add),cl=GKA_COL;   // 通常攻撃で撃つ属性のビーム（ゲートキーパー用）: 外側は属性色・芯は明るく。闇は黒紫（通常の重ね方）
  Object.assign(emMat,{dark:[mk(0x6a30b0,.65,false),mk(0x140a22,.95,false)],a:[mk(cl.a,.55,true),mk(0xffffff,.95,true)],b:[mk(cl.b,.55,true),mk(0xe8fff8,.9,true)],c:[mk(cl.c,.55,true),mk(0xf4d8ff,.9,true)],d:[mk(cl.d,.55,true),mk(0xdff0ff,.9,true)],e:[mk(cl.e,.55,true),mk(0xff8070,.9,true)]});
  Object.assign(EMAG.COL,{dark:0x8a45e0,a:cl.a,b:cl.b,c:cl.c,d:cl.d,e:cl.e});   // 溜めの光の色
  Object.assign(EMAG.DMG,{dark:BEAM.DMG,a:BEAM.DMG,b:BEAM.DMG,c:BEAM.DMG,d:BEAM.DMG,e:BEAM.DMG});}   // ダメージは火のビームと同じ（追加効果は当たった時に gkElemHit が付ける）
Object.assign(PCOL,{a:GKA_COL.a,b:GKA_COL.b,c:GKA_COL.c,d:GKA_COL.d,e:GKA_COL.e});   // 相殺演出の色（ゲートキーパーの通常攻撃の属性）
}
