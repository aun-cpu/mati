/* magic.js — 魔法（杖で出す魔法・敵の魔法・相殺・魔法のレベル）のコード（index.html から分離）。
   index.html の、メインの <script> のあとの <script src="magic.js"> で読み込まれる（mage.js・gatekeeper.js より前）。
   このファイルが無くても index.html だけで動く。その時は、杖を振っても何も出ず（スキルツリーの◯は残るが、魔法のアイコンと選べる魔法は無い）、
   敵も魔法を撃たない。魔法人・ゲートキーパーも魔法を使うので、mage.js / gatekeeper.js は魔法が無い時は出ない。
   スキルツリー本体（MAGIC）・魔法の威力の計算（playerMagic など）・効果音は index.html に残してある。
   このファイルは、MAGIC.add({id,name,emoji,icon,cast}) で各魔法をスキルツリーに登録する（id が◯のidと同じなら、その◯に絵が入って選べる）。
   モジュールではなく普通のスクリプトなので、index.html 側の関数・定数・変数はそのまま使えて、index.html からもここの関数をそのまま呼べる。
   中のコードは index.html から切り出したままで、動きは変えていない。順番も元のまま。
   含むもの:
     1. 魔法のアイコン画像（MAGIC_ICONS）
     2. 火の玉・炎のかけら（FIRE / addFirePart / fireBurst）
     3. 迫力演出 JFX、魔法のレベルの色（MLVNOW / mlvT / mTint / mlvCol）
     4. 各魔法: 火（castFire・炎の輪 fireNova）・雷（castLightning・瞬間移動 thunderBlink）・水（castWater・giveMana）・氷（castIce）・
        闇（castDark・darkVanish）・コントロール（castLevit）・支配（castControl）・爆破（castHeCtrl）・ブラスト（castBlast）・創造（castCreation）と、それぞれの updateXxx
     5. 長押しの魔法: 光のシールド（SHIELD・ブラスト）、自分を吹き飛ばす（LAUNCH・コントロール）、体力が減らない（STAFREE・支配）、マナ0（manaZeroBlock・闇）
     6. 敵の魔法（EMAG / castEnemyMagic / updateEnemyMagic / 溜めの光）と、相殺（parryFx / magicClashTick）
     7. updateFire（魔法の毎フレームの更新。index.html のループから呼ばれる）
     8. いちばん最後: 魔法のレベル（MLV / MSCALE / magicLevelApply）と、スキルツリーの強化ボタンとのつなぎ（MAGIC.bind） */

// ---------- 魔法: 装備パネル右上の魔法ボタンでスキルツリーを開き、魔法を選ぶ。杖を振ると、選んだ魔法が出る。まだ無い魔法は、記号だけの◯。MAGIC.add({id,name,emoji,cast}) の id がノードのid（fire/thunder/water/ice/dark/a〜e/z）と同じなら、その◯に絵が入って選べるようになる ----------
const MAGIC_ICONS={"fire": "data:image/png;base64,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", "thunder": "data:image/png;base64,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", "water": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAATQklEQVR42u2de/BdVXXHP/fxC4moBTJYoBASZUqgQBEClEdEELVSNFAsr4qtlbbMtFMbQCmF2orVlkLBtjOFwNQXgrQg8pKpVIOUR4CID6IiNIIWECLYYFABf/fe3T/WWnM3Z+5z733uOef3u2fmTvJLfvecffb67u967LXWrjnnmGdXE2gBuwC3Ao8BqwAHNID2fJqM+jwT/owKfynwJWAv4O3AzcBOKvzGfJqQ2jxiAFv5e6nAl3qrvaFMcCTw/fnEBPV5JvwTgTs94Tf00wKWAV/2/q85ZYC5Q/uzwCnAVfpvnR7gb3tM8FbgfzzgTBlgjgi/3Uf4eLS/DLgLeJsKvzllgLkh/A5Q08+gq+2B4QTgeu9eUwaY48I3JjCW+HfgeL3XzBQAc1/4/rxYXOA6vdecBMFcUwEphO9fNjk14HcUDHPKMJxLAEgtfDyPwcBwLHDLXIoT1KfCH2mO7F43IZHDORMnmAsMYJSch/CzTFADXgQOAjbMBXVQnwp/bMNwEXAjEjFsUfG9gyozgAn/cOArOQs/ywR1Xr53UPdshSkAJnCZEbYUuAfYQVfnpBjNDxsfAfygqiCoogqoe8JfC+w4YeEbAG0D6QZgYVXns17B8TpgMbJzt0zBUMR7mAraF/i4t/prUwDkpK48f/zfgNeWwAgzEJwMXKkgaE4BkI/wbWKvRFK4yrJT19QYxLuAM/XvzSkA0uvcWeACneiyTbIxwUXAqVRoG7kKXoBN7qnApz3hp9C1LqHOdp4xepTaKKUPFJUdAObuHazuXkpf34TvEhpvNr4n1D18VH8urXtYZhVgfvXrgKsTC6qt9/mFB6hOwjHvQnfTKCXLzBsA+BP2efX5O4nGa57DU8CBasFv1nunoGuLESwHPqXv0igrCMoKAMvK+Qywd0J3z+yHLwIrgG8C1yhdP51QZ/t7FKvLbBSW0QawyTsNuIJ0xRomhJvppnnZymwBS4DLkYzgFAJz3n2OQzaQSmcUlg0AWaOvlYA+nbJJAzgP+EhGX/vPnUFCu0eTJgXMjMJNwGHA9yjZnkGZAGBh3u2AB3RFxsb4Hd3kjTOAS7znuD5qZwb4HHBMIiYwBrsH2bm0f3NlmfSy2SOXA7smMPp84a9W4c/0EX7WM1ilv99MICwLYh0CfJSy5RA458rwaeqfq51csy7u6nj3WK33nhlxLDXnXF3/fqY3nk6C8XScc6v03o0yzH0ZVIDpxL2Br3mrppaQ9sct7LC9h1ngXOBvE9gjvj2wAvhhGYJERasAC8IsBK6lG+JNKfwm41f1OM9l/IiCwNRBzFy3keSVS5l8DkMpAWCTehGwewL92Okh/Bi3y8D0UY1JhICpl4v7duDPyxAfKFIFmOu1SqN97UiKbSUWvs9SdR3bDcQXjTrPsHw98O0iXcOiAGC59tsCDyJpXTFWv/ns/wL8GemLOWveCr5RQRAToLLv3gusLNI1LEoF1PSF/1GF34oYiwVwbgXen1O0zTZ0ZpWxvk5cdZDtF/wGcFaRrmERDGATdzTwhUg6tZV0NxLPb3kCy9Nj2U0DO9tHMJdFKNuqCr5ThCqYNADMwn+F6r5dIqxhc6ue1SDLRiZTs2fP2AdpJLF1hOdiAL5LVcHE9wrqBaz+DvA3SKi3HbF6zPB78wSF73sGDwLvI24b2cZ8GLL5NXGvYJIMYC+7H3CfZ12HrBybqD8B/pVidtnM0LzQ0+PNQDA7JCdhXw0QMSlVUIQR+E/eRMUI/5Mq/BmK2WK1cZwH3BYRKLJo4GLgg6RLfCkVA9jq/wMkpz/UhbLvfR3ZMm5T7M6aGW076Zi2jwC2gecNamBORKVNAgBmIG0FPAL8SqDhZ1bzS+o+baAce+umfo7VgFaoKvA9mpV0Q8eVVwEmpHOAnSMoziboDBV+g3IkVpjAbwA+FmGP2Io/FMkgmkjb2rwZwJIvlqjbtyjQZbLJuAWJo5cttcoM2iaSzPJrgUA31/YHeo8X6Z+/UAkGsLz7c9Rf7gQI315+M/DHlLMM28b4EvBe72cXIA+rfH4v3VS2SqoAP2p2asTL2PfOpSR76EPiA/cBF0focGPND0QsmlIAwFb/XyGRv5AXMeq/E1hTIr0/aLx1Bev3AsdrwNlZGS9XtzAvG8BefDnwDcISPczqnwUOAL5FNbpwmDF3HJJcGsJ8fvbQnsBzgSqlUAZwSNLDgsjVv0aF36QaLVhs3J/XAFGIP+9nD5lN0agKA5gO21UFF2L5G2B+iBzwsMX79ypcNgfLga8iKW+hc2AewQt5sEAeDGC6/+wII8a+c77SX9UaMJnefgiJfNYDWaCjHsHv58UCqRnABr2dGkG/5IFiXOE/qsifzdsXzpkFdlIgbB3BAhuA/ckh7F3P4aVBunhsE7n6L1C/ul5B4fss8CTwiQgWcEjuwVGekVlaBjCEP6z+/7gujAl/I1InUNXVn5IFslHQpOowJQMYMt+MNHWICYVeWPHVnwcLHEGakrlcVYBDtnxDonVm5DyGdAKrMTdasjsP1M/T7RoyDqu2lT3enVpuqW5kg9xOGSDEYrXizKuRTZBGxVd/lgWeQBpH1SJY4CT9uVU2AFhBxwlIrv+4xp8B5nkN/FTF56+PuUg+FkjhBoDdkVyIZMZgPSHK7USNkMtW/23A45Q/5p+1WUb5PZA9jdD0bwspnxzgWucKAHuZJUgmS0i2j73MlUym5XuKawZpIjGKunMeqD8dyHA2p0eTMA8yFQBqSC5byK6fTc4m4Ha6tXNlvqyy5zikummU7B0T+PWejROy0F6nQaEkaiAFAMxP/81An92E/Z9IzL9ZAePPwt0PIilqf8Hwc4SMwh8F1gUag7a4fisVU6YAQBvZ8Dmcbk+8EPq/tmKWPcB/69//DvgjhieEGnCu9xZPyFy9KRVTxgLAhL0vksAwbldMo/+n1UCiYr6/FbW2VBWsYHChqwHndsLyBOy+eyPRxegmE7EAMGEfESg8+/11Sv9V8/19sL9SjdhB299G4Y8goeFxA2b2+69UsFE0AGzwB0W6JnekdG0KNAqXA3/J4JpH6xp2d6A3YC73IWXwAozC9wwUYB2J+d8dqBPLFhTqIHWCS0YI+NwR6XUdGgigZACw6NRuSNLCuPrIfv8FDY5Ev0zBKsAAsBDpS+gGqAGQXMmQkLfdcxfCk22TAMAeuizQdbOJuB9pzljF2H+rB707pNR7pz4sYO/4GPDzAOGZJ7Ercm4SRQPg4MDVaxPxjE5kFfX/4sy7+EbaO/uwoqnNXyj4Y+ZuhyIB4Fu/Mdfaiup7PEOs00NAp9A/k9mCQM8E2j52z8OLBEA74wKG3uv5CgIguwJ7GWn76f8PMga/HDmOwgNBEB6Prqs79HgFPQBbgW/sMY+2umc89dhvnrdEqt8VscZzikBQaI+fOvBTpHagSh6AeT/LgF8doOehu2nT72pGAmBp7OKpR07Czt4gaoEvMkO1LqP4tyFRv84AAR3SR0D2nQ0aBwll0VaKl4m5tlUjMOZkrKq5fhaJO36E350d8s5PeK6gi2CCQm2A+XT5JV+HMjz4tR2Ds5tminZ/pwAIC8KcifQ8avcRoM3rEqRAph9DluKwhuk1+lx11O45mdFSwRYwuCVebQqA6q3+DzG86NU38n5E/yTQ2aJZIBYA7bIgOefLavwPQCp1R03meKkP/dc8FbGIAo+XDQWAb8U+GenHdyqw8i3ecdmYc/bikHnfB9k9bFeNAQyxP1GKC5nUDvBq5PzeMqsjS/Y4HwnvjnK2gS2QYYkuLxStwlNM+qKIlV/XWEJZ1Yh/BvA5jN680eb120Os/cMiGfiuWDmm2A5+KNKlObCkK9+Evw/dgpVRupv7iS73DpibGpLjHwOAZ2IXTz0Be2wIBIANen/KVwZuwl+GtICtjWGoWaTwv1RAWQ/ADqteqEYlhKXSO7qt5V0RALCH/m+gFWvPPgj4ZcIPj0ht8M14K3+tgmDcdLca8Nk+c2w/L9f37gTOXQ3Jpi4cAPcTtitoK+EVdItKigRAw/PNT0ESVZeOCUy/FPxmelf/2L3eqWALyQaqIc2zflwWBniK8A0NgN+muFYwdc/PbyDHxF6FbHKNW7xhq/kK4Gd9VJs95x2BMrD7bVSg1YoEQF1dwdCsXkuifAtyjsAk1YB197aTu1bqqj/X0+Pj9jdqIAkul9C76MM2hvZTFRDaRsfpWENK8ZK6gaaLvhhhCLaRdnIn5hwP8E8ANeG0lObXIHV+B3p+fmh3s/OQNLdeq9/ueTrhnU9tbHemYMzYLmFGnfsD6wNdEpu47yI1hq0R1YF/zGynx+9nhZhNnng98B7g9zQg5QivtbOiUOvk1eij+50aft/VZ447X77+301tgCgVEHtEmb3kNzQesGcArVnnrD3U+Pokw/vrjlJanf3/GaTFyuHKNod5kx9zbrGVhT+rgOq38WNFpGco44UcLWNzu06FH90yLsUZdeYz3xQIAN+v/SBwDZIzX+uzqjtIqtXZSEn5z5F+uhu97yxQVtpaV9wbkJ7Du2d0ZttTCyGX6f0tatQ924f6/bavpxN3EERN37uWAgA452I/Df3zACdX24VdLf3zfL1fs8/z6vp/F3rf7TjnNjvnntM/twx5Tku/E3PZez7vnDskMxfZj73L9Zl3HefqeO+5vd6vFiu/FACwgdSdc/fqIENfsOWce8k5t5/eszHgeTjnznDOzQ4Q0Kz3aScQul32zJ845w4dAlh7h+MjhO8/85ohYBvrk7JNXAf4FHEJjjWl70/0sJyzxlATOZpllbqiqOrwXbim9wk9pTRL+abzNwFvVXes3yFWRtE7AJcSV8hp37sitS+c4rLcuCuJa/NmBuE+6poN6rtjRtStSHXSfQoeu0fKoJLz3EPr2/vryGZPo4/wa549sIa4k8bNSL0PqSZKd6ZgIhXgU+BZkVTn09279J4zIzx3oXPubOfcpkT6vuN9366NSuWMQMM25jWZd4qxj04com7G/qTsFm4U9WqkW/hrAuMCtuLMQj8Z+A+6hzUzgGqhe9jSaby8ds9nhXqfZ/pVvr6V/n0kG2gN3QMsBsUqFqg6ereqxZhTwY01vqXMSFJ2S8gAPjLPTID6jme4nTACE9QyK2N759wfOuducc79OOD5zzjnrnPOneSce9WIq94fwwmeIdpJsPqPTWn85cEA/mpfhDRCiu1k5bzo10nKBI0+kb+s7vV15Gs0DnAkUqxxoOpkf8U/qQGtp5FMmwfVr/fjHYNsi7oXoPpT4J+HGLLj6P57kEKUYcwz8VDwoPDwe4CPR9Jflu5OBy7PPGdY7N/1MUibPYzKXu/CEMBlx3IZ3fP+Yps5GuBWegZn0gTSPABQ8zZbbkPax8cehOzH6T+D9OB5doRVmQVDbYCwfb3vRhC6b0t0kJ49lyG9fNsJ3E5bOFcgTShzOU4+r4MjbWKWKpUuTDAhznMLH1KaXTsiPQ9SVwQYVnUvtg9yRtI/ADsmYDw8xnpcDb+fklO+RF5br/7JXx9IhN6aF3DZQ/3hS71Jt1Kt+pisMs7ENjwbpIWcanaTxj92ZHi/4HEt/9N0n6FGTskyeR4f7xtjN+k2aSvhBJmq2QRcpLuIWaOtE7ly/KIQX23sAbwPqRLaKpG+z1L/h3VzrF+UsfQA8EGwFfBNZA871h7oZSWDFKh8TsPI6/tQNiNEKOs94gb2LkcCv6uxiYU9xpDqfdZqmHlUW6S0APCDNCuQzKFtEqsfmyRfCF8FvqBh4gci1M+2SBuYd+hnr8xKbZCuoMWE/yNkWz3Jfn8ZAOC7SSuR1KsUVnI/IzErlIfVmLpL1cU9A+4xgzR+2hZpyb6r6nZf9XQSC97X+Zt15a/Py+ovCgB4umw1sovXymEi8xCUH5au5zTWOpJH+KZJCp9EBtm4xs0lutIuyBEEWZ3vRxSHCbHdI3aQ1zwZY/0MOX5mfd5GX5EMkGWCs4G/93TcfGtWYcJ/Djlt7Y5JC78oAGTVwUWeu9iYJ8I3NnwOqYlYX4TwiwSAbxgeqe7bNsh278w8Ef53kO3iBxi81Z27i1YkBc6oz/tGpMbQCjPdHBS8GaZN4EtIG9kH6J4gwnwDAPriDQ0SHYEcqtikWzg6l1a9GaYfQrqMbpmktV9GFdArWAQSabsY2cOvuoHoxzseQbazb/e8jGmfQI8ebTv2KqRs67PeqmlTreNkOhmj9mIkCeV2z+0txcorCwP08hBATiP9MN226G2K7yMwTPB+A8nbgL+m2yqmcMqvAgD8IIxtr54KvB/ZhfMnOnU4OeTqFYL+msY4rvUE36GExm1ZAUCPFbMAyQs8Czk50zewahMGg59m5scu1iE5Cld7bDXu4ZBTAAxgA5vwo5C9+GN4+ZlFtoWbEhCuB+v4Kugp4Eb1YNb1AS9TAKQHAkjK2THIadoHI2XXvSzxXvcZtKqzLJS9NgFfAa5TPb9lwBinAMgJCFnhLka2mw9GyrZWINu6sQZjC/g/JFB1v67y9XTrEX2QtCs3mRUEQNaNrdP7KPXFSB+eZUhi5d66whcgrelexcvrAjYjtXemQu5AmjA9jPQe2NzDW/HVTiWv/wdOwXlYjompIgAAAABJRU5ErkJggg==", "ice": "data:image/png;base64,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"};   // 魔法ツリーのアイコン（白いシルエットのPNG。火・雷・水・氷）
// ---------- 魔法の杖の火の魔法: 振ると火の玉が狙った向きへ飛ぶ。近くの生き物がいれば、そちらへ曲がって追いかけて、当たるとダメージ ----------
const fireballs=[],fireParts=[],FIRE={SPEED:13,TURN:5,DMG:90,LIFE:3.5,RANGE:16};   // SPEED=速さ(m/秒) / TURN=追いかけて曲がる強さ / DMG=ダメージ / LIFE=消えるまでの秒数 / RANGE=追いかけ始める距離(m)
const fireGeo=new THREE.SphereGeometry(1,8,6),fireMats=[0xffe27a,0xff8a1f,0xd9340a].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
// 本物の炎の粒: 硬い球ではなく、ふちがぼやけた光の粒（常にカメラの方を向く）。生まれた時は白っぽい黄 → 黄 → 橙 → 赤 → 暗い赤（消えかけの熾火）へ色が変わり、ふくらんでから縮み、ゆらゆら揺れながら昇る
const FLAME_TEX=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.22,'rgba(255,255,255,.8)');r.addColorStop(.5,'rgba(255,255,255,.3)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
const FLAME_ST=[[0xfff6c8,.9],[0xffd860,.85],[0xff9a24,.8],[0xff5a14,.7],[0xc8260a,.55],[0x4a1206,.35]].map(([col,o])=>new THREE.SpriteMaterial({map:FLAME_TEX,color:col,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false}));   // 色の段階（生まれてから消えるまで）
const FLAME={DRAG:1.4,BUOY:[2.2,4],SWAY:1.3,SZ:2.6};   // DRAG=空気抵抗（高いほど勢いがすぐ落ちる） / BUOY=昇る力[最初,最後] / SWAY=横の揺れ / SZ=粒の大きさの倍率
function addFirePart(x,y,z,vx,vy,vz,life,size,mats,geo){                      // 小さな炎のつぶ（だんだん小さくなって消える）
  if(fireParts.length>420){const o=fireParts.shift();scene.remove(o.m)}
  if((!mats||mats===fireMats)&&!geo){                                          // 火: 光の粒（ほかの属性は、これまでどおり自分の色・形の粒）
    const m=new THREE.Sprite(FLAME_ST[0]);m.position.set(x,y,z);m.scale.setScalar(.0001);scene.add(m);
    fireParts.push({m,vx,vy,vz,life,max:life,size,flame:true,ph:Math.random()*6.283,fr:6+Math.random()*6,st:0});return;
  }
  const ms=mats||fireMats,gg=partGeo(ms,geo)||fireGeo,m=new THREE.Mesh(gg,ms[Math.floor(Math.random()*ms.length)]);if(gg===spikeGeo||gg===ringGeo||gg===squareGeo||gg===iceGeo)m.rotation.set(Math.random()*6.283,Math.random()*6.283,Math.random()*6.283);m.position.set(x,y,z);m.scale.setScalar(size);scene.add(m);
  fireParts.push({m,vx,vy,vz,life,max:life,size});
}
function fireBurst(x,y,z,n,sp){for(let i=0;i<n;i++)addFirePart(x,y,z,(Math.random()-.5)*sp,(Math.random()-.2)*sp,(Math.random()-.5)*sp,.35+Math.random()*.3,.09+Math.random()*.1)}
// ---------- 魔法の迫力演出 JFX: 色・仕様はそのまま、着弾の「弾ける感じ・禍々しさ」だけを足す層（黒い縁取りの破片・衝撃波の輪・光の閃き・地面のトゲ・黒いインクの染み・稲妻の枝・画面の揺れ） ----------
const JFX=(()=>{
  const L=[],G={sph:new THREE.SphereGeometry(1,16,12),shard:new THREE.TetrahedronGeometry(1),spike:new THREE.ConeGeometry(.3,1.8,5).translate(0,.9,0),ring:new THREE.RingGeometry(.8,1,40),disc:new THREE.CircleGeometry(1,22),dome:new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2)};
  const PAL={fire:[0xfff0b0,0xff6a14,0x2a0c04],water:[0xdff4ff,0x4fa8ff,0x0a2a70],thunder:[0xffffff,0x7fa8ff,0x10206a],ice:[0xffffff,0x9fdcff,0x0f4a8a],dark:[0xb070ff,0x3a1a5c,0x000000],a:[0xffffff,0xffe45a,0x6a3a00],b:[0xffffff,0x3de0c0,0x044a40],c:[0xffffff,0xc040ff,0x3a0a5a],d:[0xffffff,0x3a9bff,0x0a1a60],e:[0xff6a5a,0xe01818,0x2a0000]};
  const S={cur:PAL.fire,PAL,last:0};
  const mt=(c,o,add)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false,side:THREE.DoubleSide});
  const drop=o=>{scene.remove(o.m);o.m.traverse(q=>{if(q.material)q.material.dispose()})};
  const put=o=>{if(L.length>200)drop(L.shift());L.push(o);scene.add(o.m)};
  const gY=(x,y,z)=>Math.max(supportAt(x,z,y+.6),WATER),rnd=Math.random;
  function ring(x,y,z,r,life,col,add,op){const m=new THREE.Mesh(G.ring,mt(col,op||.9,add));m.rotation.x=-Math.PI/2;m.position.set(x,y+.06,z);m.scale.setScalar(.2);put({k:'ring',m,t:0,life,r,o:op||.9})}
  function flash(x,y,z,s,col,life){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:FLAME_TEX,color:col,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));m.position.set(x,y,z);m.scale.setScalar(.1);put({k:'flash',m,t:0,life,s,o:1})}
  function shards(x,y,z,n,sp,c,size,dir){for(let i=0;i<n;i++){const g=new THREE.Group(),a=rnd()*6.283,e=rnd(),r=.5+rnd();
    const dk=c===PAL.dark,br=new THREE.Mesh(G.shard,mt(dk?(i%2?c[1]:c[0]):(i%3?c[1]:c[0]),dk?.9:.95,!dk));
    const sx=size*(.5+r*.6),sy=size*.3,sz=size*(1+r*1.4);br.scale.set(sx,sy*1.4,sz);g.add(br);g.rotation.set(rnd()*6.283,rnd()*6.283,rnd()*6.283);g.position.set(x,y,z);
    const s=sp*(.4+rnd()*.9);let vx=Math.cos(a)*s,vz=Math.sin(a)*s,vy=(1.5+e*5)*(sp/6);if(dir){vx=dir.x*s+(rnd()-.5)*s*.5;vy=dir.y*s+(rnd()-.5)*s*.5;vz=dir.z*s+(rnd()-.5)*s*.5}
    put({k:'shard',m:g,t:0,life:.45+rnd()*.5,vx,vy,vz,sx:(rnd()-.5)*18,sy:(rnd()-.5)*18})}}
  function flames(x,y,z,n,R,h){                                       // 火: 地面から噴き出すトゲを、炎の柱にする（白っぽい黄の根元→オレンジ→赤の先。ゆらめきながら立ちのぼって消える）
    for(let i=0;i<n;i++){const g=new THREE.Group(),a=i/n*6.283+rnd()*.5,r=.2+rnd()*R,hh=h*(.7+rnd()*.8),w=.75+rnd()*.35,sp=[];
      for(let k=0;k<5;k++){const f=k/4,m=new THREE.Sprite(new THREE.SpriteMaterial({map:FLAME_TEX,color:f<.25?0xfff0b0:f<.6?0xffa020:0xff4a10,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
        m.visible=false;g.add(m);sp.push({m,f,ph:rnd()*6.283})}
      g.position.set(x+Math.cos(a)*r,y,z+Math.sin(a)*r);
      put({k:'flame',m:g,t:0,life:.8+rnd()*.3,h:hh,w,d:rnd()*.08,sp})}}
  function spikes(x,y,z,n,R,h,c){if(c===PAL.fire){flames(x,y,z,n,R,h);return}for(let i=0;i<n;i++){const g=new THREE.Group(),a=i/n*6.283+rnd()*.5,r=.2+rnd()*R,dk=c===PAL.dark,br=new THREE.Mesh(G.spike,mt(i%2?c[1]:c[0],dk?.9:.6,!dk));
    g.add(br);const hh=h*(.5+rnd()*.7);g.userData.h=hh;g.position.set(x+Math.cos(a)*r,y,z+Math.sin(a)*r);g.rotation.set(Math.sin(a)*.45*r/R,0,-Math.cos(a)*.45*r/R);g.scale.set(.0001,.0001,.0001);
    put({k:'spike',m:g,t:0,life:.8+rnd()*.3,h:hh,d:rnd()*.08})}}
  function dome(x,y,z,R,c,life){for(const [col,s,o] of [[c[1],1,.35],[c[0],.62,.5]]){const m=new THREE.Mesh(G.dome,mt(col,o,true));m.position.set(x,y,z);m.scale.setScalar(.2);put({k:'dome',m,t:0,life:life*(s===1?1:.8),R:R*s,o})}}
  function ink(x,y,z,R,c,life){for(let i=0;i<3;i++){const m=new THREE.Mesh(G.disc,mt(c[2],.35,false)),a=rnd()*6.283,r=rnd()*R*.5;m.rotation.x=-Math.PI/2;m.rotation.z=rnd()*6.283;m.position.set(x+Math.cos(a)*r,y+.04+i*.002,z+Math.sin(a)*r);m.scale.set(R*(.4+rnd()*.6),R*(.2+rnd()*.5),1);put({k:'ink',m,t:0,life:life*(.7+rnd()*.5),sx:m.scale.x,sy:m.scale.y,o:.35})}}
  function arcs(x,y,z,n,len,c){for(let a=0;a<n;a++){const th=rnd()*6.283,l=len*(.6+rnd()*.7),p=[new THREE.Vector3(x,y,z)];for(let i=1;i<=6;i++){const t=i/6;p.push(new THREE.Vector3(x+Math.cos(th)*l*t+(rnd()-.5)*.7,y+.1+(rnd()-.4)*.7*(1-t),z+Math.sin(th)*l*t+(rnd()-.5)*.7))}
    const g=new THREE.Group(),mo=mt(c[1],.8,true),mc=mt(0xffffff,1,true);boltSegs(g,p,.11,mo);boltSegs(g,p,.035,mc);put({k:'arc',m:g,t:0,life:.28,mo,mc})}}
  function motes(x,y,z,R,n){const c=PAL.dark;for(let i=0;i<n;i++){const a=rnd()*6.283,b=Math.acos(2*rnd()-1),r=R*(.6+rnd()*.7),dx=Math.sin(b)*Math.cos(a)*r,dy=Math.cos(b)*r,dz=Math.sin(b)*Math.sin(a)*r,m=new THREE.Mesh(G.shard,mt(i%2?c[1]:c[0],.9,i%2===0));
    m.scale.set(.06+rnd()*.08,.04,.14+rnd()*.14);m.rotation.set(rnd()*6.283,rnd()*6.283,rnd()*6.283);m.position.set(x+dx,y+dy,z+dz);put({k:'pull',m,t:0,life:.35+rnd()*.35,cx:x,cy:y,cz:z,dx,dy,dz,sx:(rnd()-.5)*14,sy:(rnd()-.5)*14,sc:m.scale.clone()})}}
  function absorb(x,y,z,p,gr,o){const c=PAL.dark,R=2.6*p;   // 闇: 外へ弾けず、まわりから中心へ吸い込まれて、黒い玉に収束して消える
    const orb=new THREE.Mesh(G.sph,mt(0x000000,.92,false));orb.position.set(x,y,z);orb.scale.setScalar(.1);put({k:'orb',m:orb,t:0,life:.6,R:.6*p});
    const rg=new THREE.Mesh(G.ring,mt(c[0],.7,true));rg.rotation.x=-Math.PI/2;rg.position.set(x,gr+.08,z);rg.scale.setScalar(R);put({k:'ringin',m:rg,t:0,life:.5,r:R});
    const rg2=new THREE.Mesh(G.ring,mt(c[1],.8,false));rg2.rotation.x=-Math.PI/2;rg2.position.set(x,gr+.07,z);rg2.scale.setScalar(R*1.5);put({k:'ringin',m:rg2,t:0,life:.65,r:R*1.5});
    motes(x,y,z,R,Math.round(26*p));flash(x,y,z,2.2*p,c[0],.3);if(o.ink)ink(x,gr,z,1.8*p,c,1.1)}
  function impact(x,y,z,o){o=o||{};const c=o.cols||S.cur,p=o.power||1,gr=o.ground===false?y:gY(x,y,z);if(c===PAL.dark){absorb(x,y,z,p,gr,o);return}
    flash(x,y+.1,z,1.7*p,c[0],.14);flash(x,y+.1,z,3*p,c[1],.26);
    if(o.ring!==false){ring(x,gr,z,2*p,.34,c[1],true,.55);}
    shards(x,y+.1,z,Math.round((o.shards||12)*p),5.5*p+3,c,.11*(.6+p*.4));
    if(o.dome)dome(x,gr,z,2.2*p,c,.3);if(o.spikes)spikes(x,gr,z,o.spikes,1.8*p,1.5*p,c);if(o.ink)ink(x,gr,z,1.8*p,c,1.1);if(o.arcs)arcs(x,gr+.15,z,o.arcs,2.6*p,c);
    if(o.shake!==false&&p>=1&&Math.hypot(x-player.x,z-player.z)<40){shakeT=Math.max(shakeT||0,.16+.1*p);shakeA=Math.max(shakeA||0,.035+.03*p)}}
  function hit(t){const now=performance.now();if(now-(t._jfx||0)<130)return;t._jfx=now;const sz=t.size||1;impact(t.x,t.y+(t.jy||0)+sz*(t.hy||.95),t.z,{power:.6,shards:9,ring:false,ground:false,shake:false})}
  function muzzle(O,A,c,keep){if(!keep)S.cur=c;flash(O.x,O.y,O.z,1.5,c[0],.14);const m=new THREE.Mesh(G.ring,mt(c[1],.9,true));m.position.copy(O).addScaledVector(A,.25);m.lookAt(O.clone().add(A));m.scale.setScalar(.1);put({k:'ring',m,t:0,life:.22,r:1.1,o:.9,flat:1});
    if(c===PAL.dark)motes(O.x+A.x*.5,O.y+A.y*.5,O.z+A.z*.5,1,10);else shards(O.x,O.y,O.z,7,12,c,.07,A)}
  function muzzleAuto(id){try{const f=beamFrame();muzzle(f.O,f.A,PAL[id])}catch(e){}}
  function update(dt){for(let i=L.length-1;i>=0;i--){const o=L[i];o.t+=dt;const u=o.t/o.life;if(u>=1){drop(o);L.splice(i,1);continue}const m=o.m,e=1-(1-u)*(1-u);
    switch(o.k){
      case 'ring':m.scale.setScalar(.2+o.r*e);m.material.opacity=o.o*(1-u);break;
      case 'flash':m.scale.setScalar(o.s*(.3+.9*e));m.material.opacity=(1-u)*(1-u);break;
      case 'dome':m.scale.setScalar(.2+o.R*e);m.material.opacity=o.o*(1-u);break;
      case 'ink':m.scale.set(o.sx*(1+.3*e),o.sy*(1+.3*e),1);m.material.opacity=o.o*(1-u)*(1-u);break;
      case 'shard':o.vy-=15*dt;m.position.x+=o.vx*dt;m.position.y+=o.vy*dt;m.position.z+=o.vz*dt;m.rotation.x+=o.sx*dt;m.rotation.y+=o.sy*dt;m.scale.setScalar(1-u*u*.9);break;
      case 'spike':{const t=Math.max(0,o.t-o.d),s=Math.min(1,t/.09),k=u>.55?1-(u-.55)/.45:1;m.scale.set(.0001+s*k,.0001+s*k*o.h,.0001+s*k);break}
      case 'flame':{const t=Math.max(0,o.t-o.d),s=Math.min(1,t/.12),k=u>.5?1-(u-.5)/.5:1;   // s=立ちのぼる / k=後半に細く低くなって消える
        for(const q of o.sp){const m=q.m,fl=1+.12*Math.sin(t*28+q.ph);m.visible=s>.01;
          m.position.set(Math.sin(t*14+q.ph)*.07*q.f*o.w,o.h*(.1+.8*q.f)*s*(.35+.65*k)*fl,Math.cos(t*11+q.ph)*.07*q.f*o.w);
          const z=(1.15-.7*q.f)*o.w*s*(.3+.7*k);m.scale.set(z,z*1.7,1);m.material.opacity=.9*k}
        break}
      case 'orb':m.scale.setScalar(Math.max(.01,o.R*(.4+.6*Math.sin(Math.min(1,u*1.3)*1.5708))*(1-u*u*.92)));m.material.opacity=.92*(1-u*u);break;
      case 'ringin':m.scale.setScalar(Math.max(.15,o.r*(1-e)));m.material.opacity=.75*Math.sin(u*3.1416);break;
      case 'pull':{const k=u*u,f=1-k;m.position.set(o.cx+o.dx*f,o.cy+o.dy*f,o.cz+o.dz*f);m.rotation.x+=o.sx*dt;m.rotation.y+=o.sy*dt;m.scale.copy(o.sc).multiplyScalar(1-u*.7);break}
      case 'arc':m.visible=rnd()<.85;o.mo.opacity=.8*(1-u);o.mc.opacity=1-u;break}}}
  return Object.assign(S,{impact,hit,muzzle,muzzleAuto,update,arcs})})();
// 火の魔法: 火の玉ではなく、正面へのびる炎の光線（一瞬だけ出る。向きは画面の中央に合わせて動く。線上の生き物すべてにダメージ）
// ---------- 魔法のレベルが上がるほど、見た目の色が濃くなる（Lv1=元の色 → Lv10=深い色。プレイヤーの魔法だけ） ----------
const MLVNOW={};   // 魔法ごとの今のレベル（magicLevelApplyで更新）
function mlvT(id){return Math.min(1,Math.max(0,((MLVNOW[id]||1)-1)/9))}   // 0(Lv1)〜1(Lv10)
function mTint(id,m,deep,opK){   // 材質mの元の色・不透明度を覚えておき、レベルが高いほどdeepの色に近づけて、少し不透明にする（opK=不透明度の増え方）
  const u=m.userData||(m.userData={});if(u.c0===undefined){u.c0=m.color.getHex();u.o0=m.opacity}
  const t=mlvT(id);m.color.setHex(u.c0).lerp(new THREE.Color(deep),t);m.opacity=Math.min(1,u.o0*(1+(opK===undefined?.5:opK)*t));
}
function mlvCol(id,base,deep){return new THREE.Color(base).lerp(new THREE.Color(deep),mlvT(id))}
const BEAM={LEN:14,TIME:.22,TICK:.1,DMG:45,RADIUS:.7};   // LEN=届く距離(m) / TIME=吹き続ける秒数 / TICK,DMG=ダメージの間隔(秒)とその1回の量 / RADIUS=光線の太さ(m)
const PBEAM={...BEAM};   // プレイヤー専用（魔法のレベルで強化。敵の火は元のBEAMのまま）
let flame=null;
function beamFrame(){                                                 // 今の杖の先の位置(O)と正面の向き(A)
  const cp=Math.cos(player.pitch),A=new THREE.Vector3(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp),yw=player.yaw;
  return {A,O:new THREE.Vector3(camera.position.x+A.x*.9+Math.cos(yw)*.25,camera.position.y+A.y*.9-.2,camera.position.z+A.z*.9-Math.sin(yw)*.25)};
}
function castFire(){castSnd('fireCastSample',.85);JFX.muzzleAuto('fire');
  if(!flame){
    const geo=new THREE.CylinderGeometry(1,.3,1,12,1,true);geo.rotateX(Math.PI/2);   // 手元が細く、先が太い筒（+Z方向へのびる）
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0xff6a14,.3)),core=new THREE.Mesh(geo,mk(0xffe9a0,.6));
    g.add(out);g.add(core);g.visible=false;scene.add(g);flame={g,out,core,t:0,tick:0};
  }
  mTint('fire',flame.out.material,0xb01000);mTint('fire',flame.core.material,0xff5a10,.2);
  flame.t=0;flame.tick=0;flame.fx=0;flame.g.visible=true;
}
// ---------- 長押しの輪（火・氷）: 杖で「ファイア」か「アイス」を選んで長押しすると、一瞬プレイヤーの周りに広がって、まわりの生き物に効く（火=火ダメージ＋火傷 / 氷=凍らせる）。クールタイムは魔法ごとに別で、魔法レベル1〜10で20秒〜5秒 ----------
const FNOVA={R:4,DMG_K:2,TIME:.35,CD_MAX:20,CD_MIN:5,BUFF_T:5,BLINK:10,BLINK_R:3,BLINK_K:.5,next:{fire:0,ice:0,water:0,thunder:0,dark:0,a:0,c:0,d:0,e:0}},fnovas=[],fnSphere=new THREE.SphereGeometry(1,20,14);   // BUFF_T=水：マナが上がっている秒数 / BLINK,BLINK_R,BLINK_K=雷：瞬間移動の距離(m)・通り道の左右の幅(m)・サンダー1発のダメージの何倍か（距離と幅はレベルで伸びる） / R=Lv1の半径(m・レベルで届く距離と一緒に伸びる) / DMG_K=火：ファイア1回分のダメージの何倍か / TIME=広がる秒数 / CD_MAX,CD_MIN=クールタイム(秒) Lv1→Lv10 / next=次に使える時刻(ms)
function fireNovaCD(id){const mix=MAGIC.mix;if(mix&&(id===mix[0]||id===mix[1]))id=mix[0];   // 混合中は、2つとも先に選んだ魔法のクールタイム（そのレベルの秒数）に合わせる
  const mx=MAGIC.MAXLV,lv=Math.min(mx,Math.max(1,MAGIC.lv(id)));return FNOVA.CD_MAX+(FNOVA.CD_MIN-FNOVA.CD_MAX)*(lv-1)/(mx-1)}
function segDist(px,py,pz,a,b){const abx=b.x-a.x,aby=b.y-a.y,abz=b.z-a.z,l2=abx*abx+aby*aby+abz*abz;let t=l2>1e-6?((px-a.x)*abx+(py-a.y)*aby+(pz-a.z)*abz)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(a.x+abx*t),py-(a.y+aby*t),pz-(a.z+abz*t))}   // 点と線分の距離
function thunderBlink(now){   // 雷の長押し: 視点の向きへ稲妻になって瞬間移動。壁や地面の手前で止まる。通り道とその周りの生き物にサンダーのダメージ
  const cp=Math.cos(player.pitch),A=new THREE.Vector3(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp);
  const S=new THREE.Vector3(player.x,player.y,player.z),Lmax=FNOVA.BLINK*PBOLT.LEN/BOLT.LEN;
  let L=Lmax;
  for(let d=.5;d<=Lmax;d+=.5){const x=S.x+A.x*d,y=S.y+A.y*d,z=S.z+A.z*d;if(solidAt(x,y,z)||solidAt(x,y-1,z)){L=Math.max(0,d-1);break}}   // 壁・地面にぶつかる手前まで
  if(L<1.5){if(typeof gameToast==='function')gameToast('進めない');return false}
  FNOVA.next.thunder=now+fireNovaCD('thunder')*1000;
  const E=S.clone().addScaledVector(A,L),a=new THREE.Vector3(S.x,S.y-.8,S.z),b=new THREE.Vector3(E.x,E.y-.8,E.z),R=FNOVA.BLINK_R*PBOLT.RADIUS/BOLT.RADIUS,dmg=PBOLT.DMG*FNOVA.BLINK_K;
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1;   // 通り道（幅R）の生き物にダメージ（魔力が低いと通らないのはサンダーと同じ）
    if(segDist(c.x,c.y+(c.jy||0)+sz*.5,c.z,a,b)<R+.4*sz&&magicHits(c))magicHit(c,dmg,a.x,a.z)}
  creaRockHit(a,A,L,R*.5);   // 通り道のクリエイションの結晶は爆発する
  const Rr=new THREE.Vector3().crossVectors(A,new THREE.Vector3(0,1,0));if(Rr.lengthSq()<1e-4)Rr.set(1,0,0);Rr.normalize();const U=new THREE.Vector3().crossVectors(Rr,A).normalize(),pts=[a.clone()],SEG=14;
  for(let i=1;i<=SEG;i++){const t=i/SEG,j=(i===SEG?.2:.7)*(.4+Math.random()*.6);pts.push(a.clone().addScaledVector(A,L*t).addScaledVector(Rr,(Math.random()-.5)*2*j).addScaledVector(U,(Math.random()-.5)*2*j))}
  const mOut=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0x7fa8ff,0x2a3cff),transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
        mCore=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0xffffff,0x8fb0ff),transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),g=new THREE.Group();
  boltSegs(g,pts,.4,mOut);boltSegs(g,pts,.12,mCore);scene.add(g);bolts.push({g,mOut,mCore,t:0,mine:false,O:a.clone(),A:A.clone(),L,life:.5});   // 通ったあとの稲妻が一瞬残る
  fireBurst(a.x,a.y,a.z,12,5);fireBurst(b.x,b.y,b.z,12,5);
  player.x=E.x;player.z=E.z;player.gy=supportAt(E.x,E.z,E.y-1.7);   // 移動（空中なら落ちる・地面なら足がつく）
  if(E.y-1.7>player.gy+.15){player.air=true;player.vy=0;player.y=E.y}else{player.air=false;player.vy=0;player.y=player.gy+1.7}
  collide();if(!player.air)player.y=player.gy+1.7;
  {const gx=player.x,gz=player.z,gg=player.gy,top=gg+28,vp=[new THREE.Vector3(gx,top,gz)];   // 到着地点: 空から雷が落ちる（太くて長く見える）＋光の球と火花
    for(let i=1;i<=12;i++){const t=i/12,j=(i===12?0:.9)*(.4+Math.random()*.6);vp.push(new THREE.Vector3(gx+(Math.random()-.5)*2*j,top+(gg-top)*t,gz+(Math.random()-.5)*2*j))}
    const vo=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0x7fa8ff,0x2a3cff),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}),
          vc=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0xffffff,0x8fb0ff),transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}),vg=new THREE.Group();
    boltSegs(vg,vp,.5,vo);boltSegs(vg,vp,.16,vc);scene.add(vg);bolts.push({g:vg,mOut:vo,mCore:vc,t:0,mine:false,O:vp[0].clone(),A:new THREE.Vector3(0,-1,0),L:28,life:.6});
    fireBurst(gx,gg+.3,gz,20,6);
    const sm=(col,op)=>new THREE.Mesh(fnSphere,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide})),m1=sm(0x7fa8ff,.3),m2=sm(0xffffff,.4);
    for(const q of [m1,m2]){q.position.set(gx,player.y-.7,gz);q.scale.setScalar(.2);scene.add(q)}fnovas.push({m1,m2,t:0,R:3})}
  if(navigator.vibrate)navigator.vibrate(40);
  return true;
}
// ---------- コントロールの長押し: 杖で「コントロール」を選んで長押しすると照準モード（視点を動かして狙う）。指を離すと、視点の向きへプレイヤー自身が吹き飛ぶ ----------
const LAUNCH={SPEED:26,LV_H:4/9,LV_V:1.5/9,CD:3,next:0,aim:false,hud:null};   // SPEED=Lv1の飛ぶ勢い / LV_H,LV_V=1レベルごとの増え方（横はLv10で×5＝飛ぶ距離も約5倍・縦はLv10で×2.5） / CD=次に飛べるまでの秒数 / aim=照準中
function launchHud(on){if(!LAUNCH.hud){const d=document.createElement('div');d.style.cssText='position:fixed;top:40px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:10px;background:rgba(150,60,220,.75);color:#fff;font-size:13px;z-index:60;pointer-events:none;display:none';d.textContent='🌀 狙って離すと飛ぶ';document.body.appendChild(d);LAUNCH.hud=d}LAUNCH.hud.style.display=on?'block':'none'}
function launchAimStart(){
  const c=INV.current;
  if(!c||c.id!=='wand'||!MAGIC.ids().includes('b')||MINI.big||STAT.dead||player.stunT>0||performance.now()<INV.noSwingUntil)return false;
  if(manaZeroBlock())return false;
  const now=performance.now();
  if(now<LAUNCH.next){if(typeof gameToast==='function')gameToast('吹き飛び: あと'+Math.ceil((LAUNCH.next-now)/1000)+'秒');return false}
  LAUNCH.aim=true;launchHud(true);return true;
}
function launchCancel(){LAUNCH.aim=false;launchHud(false)}
function launchGo(){                                                  // 指を離した: 視点の向きへ吹き飛ぶ
  if(!LAUNCH.aim)return;launchCancel();
  if(STAT.dead||MINI.big)return;
  const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),lv=Math.min(MAGIC.MAXLV,Math.max(1,MAGIC.lv('b'))),sh=LAUNCH.SPEED*(1+LAUNCH.LV_H*(lv-1)),sv=LAUNCH.SPEED*(1+LAUNCH.LV_V*(lv-1));   // 魔法レベルで勢いが伸びる
  if(cp>1e-3){player.kbx=-Math.sin(player.yaw);player.kbz=-Math.cos(player.yaw);player.kbv=Math.max(player.kbv||0,sh*cp)}
  let vy=sv*sp;if(!player.air&&vy<2)vy=2;
  player.air=true;player.vy=vy;
  LAUNCH.next=performance.now()+(MAGIC.mix?fireNovaCD(MAGIC.mix[0]):LAUNCH.CD)*1000;   // 混合中は、先に選んだ魔法のクールタイムに合わせる（単体は今まで通り）
  shakeT=.25;shakeA=.08;if(navigator.vibrate)navigator.vibrate(30);
}
// ---------- 高エネルギー（ブラスト）の長押し: プレイヤーの周りに光のシールド。魔法だけを防ぐ（敵の魔法も自分の魔法も。物理攻撃は防がない） ----------
// 耐久ダメージ HP_MIN→HP_MAX / 継続秒数 T_MIN→T_MAX は魔法レベル1→10で直線的に伸びる。耐久を一度で超える魔法が当たった時は、シールドは壊れるが、その1発のダメージ（と火傷・凍結などの追加効果）は防ぐ。
// 切れた（時間切れ・壊れた）あとは、ほかの長押しと同じクールタイム（Lv1=20秒→Lv10=5秒）が入る。CD_ON=falseでなくす。
var SHIELD={on:false,hp:0,max:0,t:0,dur:0,flash:0,blk:false,g:null,shell:null,wire:null,hud:null,R:1.6,HP_MIN:100,HP_MAX:1000,T_MIN:10,T_MAX:20,CD_ON:true};
function shieldHud(on){
  if(!SHIELD.hud){const d=document.createElement('div');d.style.cssText='position:fixed;top:66px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:10px;background:rgba(70,130,255,.75);color:#fff;font-size:13px;z-index:60;pointer-events:none;display:none;white-space:nowrap';document.body.appendChild(d);SHIELD.hud=d}
  SHIELD.hud.style.display=on?'block':'none';
}
function shieldBuild(){
  if(SHIELD.g)return;
  const g=new THREE.Group(),shell=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),glowMat(0xfff0b0,.1)),
        wire=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshBasicMaterial({color:0xfff6c8,wireframe:true,transparent:true,opacity:.3,blending:THREE.AdditiveBlending,depthWrite:false}));
  g.add(shell);g.add(wire);g.visible=false;g.renderOrder=5;scene.add(g);SHIELD.g=g;SHIELD.shell=shell;SHIELD.wire=wire;
}
function shieldStart(now){
  if(SHIELD.on){if(typeof gameToast==='function')gameToast('シールド展開中');return false}
  const lv=Math.min(MAGIC.MAXLV,Math.max(1,MAGIC.lv('a'))),k=(lv-1)/(MAGIC.MAXLV-1);
  SHIELD.max=SHIELD.hp=Math.round(SHIELD.HP_MIN+(SHIELD.HP_MAX-SHIELD.HP_MIN)*k);
  SHIELD.dur=SHIELD.t=SHIELD.T_MIN+(SHIELD.T_MAX-SHIELD.T_MIN)*k;
  SHIELD.on=true;SHIELD.flash=1;SHIELD.blk=false;
  shieldBuild();SHIELD.g.visible=true;shieldHud(true);
  fireBurst(player.x,player.y-.7,player.z,16,5);
  if(navigator.vibrate)navigator.vibrate(30);
  return true;
}
function shieldOff(silent,broken){                                  // シールドを消す（silent=死亡・リセット時はクールタイムなし / broken=壊れた）
  if(!SHIELD.on)return;
  SHIELD.on=false;if(SHIELD.g)SHIELD.g.visible=false;shieldHud(false);
  if(!silent){
    if(SHIELD.CD_ON)FNOVA.next.a=performance.now()+fireNovaCD('a')*1000;
    if(broken){for(let i=0;i<34;i++)addFirePart(player.x,player.y-.7,player.z,(Math.random()-.5)*12,Math.random()*7-1,(Math.random()-.5)*12,.4+Math.random()*.4,.05+.07*Math.random(),blastMats);if(navigator.vibrate)navigator.vibrate(60)}
    if(typeof gameToast==='function')gameToast(broken?'シールドが壊れた':'シールドが切れた');
  }
}
function shieldAbsorb(dmg){                                         // 魔法のダメージdmgを受け止める。受け止めたらtrue（ダメージ・追加効果は無し）。耐久を超えたらシールドは壊れるが、その1発は防ぐ
  if(!SHIELD.on||STAT.dead)return false;
  SHIELD.blk=true;SHIELD.hp-=Math.max(0,dmg||0);SHIELD.flash=1;
  if(SHIELD.hp<=0)shieldOff(false,true);
  return true;
}
function shieldUpdate(dt){
  if(!SHIELD.on)return;
  if(STAT.dead){shieldOff(true);return}
  SHIELD.t-=dt;if(SHIELD.t<=0){shieldOff(false,false);return}
  const g=SHIELD.g,tm=performance.now()/1000,f=SHIELD.flash;SHIELD.flash=Math.max(0,f-dt*3);
  g.position.set(player.x,player.y-.75,player.z);g.scale.setScalar(SHIELD.R*(1+.02*Math.sin(tm*6)+.06*f));
  SHIELD.wire.rotation.y=tm*.4;SHIELD.wire.rotation.x=tm*.23;
  SHIELD.shell.material.opacity=.1+.2*f;SHIELD.wire.material.opacity=.28+.55*f;
  g.visible=!(SHIELD.t<3&&Math.sin(tm*16)<-.25);                 // 切れる3秒前から点滅
  const t=Math.ceil(SHIELD.t);const s='🛡 耐久 '+Math.max(0,Math.ceil(SHIELD.hp))+'/'+SHIELD.max+'　あと'+t+'秒';
  if(SHIELD._s!==s){SHIELD._s=s;SHIELD.hud.textContent=s}
}
const STAFREE={T_MIN:5,T_MAX:10};   // 支配の長押し: 魔法レベル1→10で 5→10秒、体力（橙のバー）が減らない
function staFreeStart(now){
  if(STAT.staFreeT>0){if(typeof gameToast==='function')gameToast('体力ロック中');return false}
  const lv=Math.min(MAGIC.MAXLV,Math.max(1,MAGIC.lv('c'))),dur=STAFREE.T_MIN+(STAFREE.T_MAX-STAFREE.T_MIN)*(lv-1)/(MAGIC.MAXLV-1);
  STAT.staFreeT=dur;STAT.staHold=STAT.sta;
  FNOVA.next.c=now+dur*1000+fireNovaCD('c')*1000;   // 終わってからクールタイム
  if(typeof gameToast==='function')gameToast('体力が減らない（'+dur.toFixed(1)+'秒）');
  if(navigator.vibrate)navigator.vibrate(30);
  return true;
}
function manaZeroBlock(){if(STAT.manaT>0&&STAT.manaK===0){if(typeof gameToast==='function')gameToast('マナ0の間は魔法が打てない');return true}return false}   // 闇の長押しでマナが0の間は、魔法（長押しも）打てない
function fireNovaStart(){                                           // 長押し: 混合なら先に選んだ魔法→後の魔法の順に、両方の長押しを発動する
  const ids=MAGIC.ids();
  if(!MAGIC.mix)return fireNovaOne(ids[0]);
  let any=false;
  for(const id of ids){if(STAT.dead)break;if(id==='b'){if(launchAimStart())any=true}else if(fireNovaOne(id))any=true}   // 先の効果で後の魔法が打てなくなることもある（闇→水 は水が発動しない / 水→闇 は水の効果がマナ0で消える）
  return any;
}
function fireNovaOne(id){
  const c=INV.current;
  if(!c||c.id!=='wand'||(id!=='fire'&&id!=='ice'&&id!=='water'&&id!=='thunder'&&id!=='dark'&&id!=='a'&&id!=='c'&&id!=='d'&&id!=='e'))return false;
  if(MINI.big||STAT.dead||player.stunT>0||performance.now()<INV.noSwingUntil)return false;
  if(manaZeroBlock())return false;
  const now=performance.now(),nm=id==='fire'?'炎の輪':id==='ice'?'氷の輪':id==='thunder'?'雷の瞬間移動':id==='dark'?'マナ0':id==='a'?'光のシールド':id==='c'?'体力ロック':id==='d'?'結晶の壁':id==='e'?'自爆':'マナ強化';
  if(now<FNOVA.next[id]){if(typeof gameToast==='function')gameToast(nm+': あと'+Math.ceil((FNOVA.next[id]-now)/1000)+'秒');return false}
  if(id==='fire'||id==='ice'||id==='water'||id==='dark'||id==='e')playerAtkNote();   // 長押しの攻撃魔法も、番人の盾の反応の対象
  if(id==='e')return selfDestructStart(now);   // 爆破: 自爆
  if(id==='thunder')return thunderBlink(now);   // 雷は輪ではなく瞬間移動（成功した時だけクールタイムに入る）
  if(id==='d')return creaWallStart(now);          // 創造: プレイヤーのまわりに低い壁
  if(id==='c')return staFreeStart(now);          // 支配: 体力が減らない
  if(id==='a')return shieldStart(now);          // 高エネルギーは輪ではなく光のシールド（切れたあとにクールタイム）
  FNOVA.next[id]=now+fireNovaCD(id)*1000;
  const R=(id==='water'||id==='dark')?2.5:FNOVA.R*(id==='fire'?PBEAM.LEN/BEAM.LEN:PICE.RANGE/ICE.RANGE),px=player.x,pz=player.z,cy=player.y-.7;
  if(id==='fire'){
    castSnd('fireCastSample',.85);
    const dmg=PBEAM.DMG*FNOVA.DMG_K;
    for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1;   // まわりの生き物に火ダメージ（魔力が低いと通らないのはファイアと同じ）
      if(Math.hypot(c.x-px,c.z-pz)<R+.4*sz&&Math.abs(c.y+(c.jy||0)+sz*.5-cy)<3+sz&&magicHits(c)){magicHit(c,dmg,px,pz);if(c.hp>0)applyBurnToCreature(c)}}
  }else if(id==='dark'){   // 闇: 自分のマナが一定時間 0（水と同じ時間・クールタイム）: 魔法攻撃力も魔法で受けるダメージも0
    castSnd('darkCastSample',.85);STAT.manaK=0;STAT.manaT=FNOVA.BUFF_T;
    if(typeof gameToast==='function')gameToast('マナ 0（'+FNOVA.BUFF_T+'秒）');
  }else if(id==='water'){   // 自分のマナが一定時間 ×1.1(Lv1)〜×2.0(Lv10): 魔法攻撃力も魔法で受けるダメージも同じ倍率
    const mx=MAGIC.MAXLV,lv=Math.min(mx,Math.max(1,MAGIC.lv('water')));STAT.manaK=1.1+.9*(lv-1)/(mx-1);STAT.manaT=FNOVA.BUFF_T;
    if(typeof gameToast==='function')gameToast('マナ ×'+STAT.manaK.toFixed(1)+'（'+FNOVA.BUFF_T+'秒）');
  }else{
    iceMatsP.forEach((q,i)=>mTint('ice',q,[0x3aa6e8,0x1c6fd0,0x9fd8ff][i],.1));
    for(const c of creatures){if(c.hp<=0||!magicHits(c))continue;const sz=c.size||1;   // まわりの生き物を凍らせる（氷の1発と同じ：凍る時間・青さ・敵対）
      if(Math.hypot(c.x-px,c.z-pz)<R+.5*sz&&Math.abs(c.y+(c.jy||0)+sz*.5-cy)<3+sz){
        if(!(c.frozen>0)){c.iceOld=c.mat.color.clone();c.mat.color.lerp(PICE.COL,PICE.BLUE)}c.frozen=Math.min(PICE.MAX,Math.max(c.frozen||0,PICE.CRE_TIME*magicRate(c)));applyFrostbiteToCreature(c);alarmCreatures(c)}}
  }
  if(id!=='water'&&id!=='dark')for(const k of creaRocks.slice())if(!k.dead&&k.t>=CREA.RISE*.6&&Math.hypot(k.x-px,k.z-pz)<R)explodeCreaRock(k);   // 近くのクリエイションの結晶は爆発する
  const mk=(col,op)=>new THREE.Mesh(fnSphere,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,blending:id==='dark'?THREE.NormalBlending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  const m1=mk(id==='fire'?0xff6a14:id==='water'?0x2f8fe8:id==='dark'?0x2a1040:0x4fb4ff,id==='dark'?.45:.3),m2=mk(id==='fire'?0xffe9a0:id==='water'?0xbfe8ff:id==='dark'?0x050508:0xe8f8ff,id==='dark'?.55:.4);
  for(const q of [m1,m2]){q.position.set(px,cy,pz);q.scale.setScalar(.2);scene.add(q)}
  fnovas.push({m1,m2,t:0,R});
  for(let i=0;i<70;i++){const a=Math.random()*6.283,sp=R/FNOVA.TIME*(.35+Math.random()*.5),x=px+Math.cos(a)*.5,y=cy+(Math.random()-.4)*1.2,z=pz+Math.sin(a)*.5;
    if(id==='fire')addFirePart(x,y,z,Math.cos(a)*sp,Math.random()*2.5,Math.sin(a)*sp,.3+Math.random()*.3,.12+Math.random()*.1);
    else if(id==='dark')addWaterPart(px+Math.cos(a)*R*.95,y,pz+Math.sin(a)*R*.95,-Math.cos(a)*R/.35,Math.random()*1.5,-Math.sin(a)*R/.35,.35,.05+Math.random()*.07,0,darkMats);
    else if(id==='water')addWaterPart(x,y,z,Math.cos(a)*sp,Math.random()*2.5,Math.sin(a)*sp,.4+Math.random()*.4,.05+Math.random()*.07);
    else addWaterPart(x,y,z,Math.cos(a)*sp,Math.random()*2.5,Math.sin(a)*sp,.4+Math.random()*.4,.05+Math.random()*.07,9,iceMatsP)}   // 氷のかけらが外へ散る
  if(navigator.vibrate)navigator.vibrate(30);
  return true;
}
let manaHud=null;
function manaHudUpdate(){   // マナが上がっている間だけ、画面上に倍率と残り秒数を出す
  if(!(STAT.manaT>0)){if(manaHud)manaHud.style.display='none';return}
  if(!manaHud){manaHud=document.createElement('div');manaHud.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:10px;background:rgba(40,120,220,.75);color:#fff;font:bold 13px sans-serif;z-index:20;pointer-events:none';document.body.appendChild(manaHud)}
  manaHud.style.display='block';const mk0=STAT.manaK===undefined?1:STAT.manaK;manaHud.style.background=mk0<1?'rgba(60,30,90,.8)':'rgba(40,120,220,.75)';manaHud.textContent=(mk0<1?'🌑 マナ ×':'💧 マナ ×')+mk0.toFixed(1)+'　'+STAT.manaT.toFixed(1)+'秒';
}
function updateFireNova(dt){   // 炎の球: すばやく広がって薄れて消える（プレイヤーについてくる）
  if(STAT.manaT>0)STAT.manaT=Math.max(0,STAT.manaT-dt);manaHudUpdate();
  for(let i=fnovas.length-1;i>=0;i--){const f=fnovas[i];f.t+=dt;const u=f.t/FNOVA.TIME;
    if(u>=1){for(const q of [f.m1,f.m2]){scene.remove(q);q.material.dispose()}fnovas.splice(i,1);continue}
    const e=1-(1-u)*(1-u);
    f.m1.position.set(player.x,player.y-.7,player.z);f.m2.position.copy(f.m1.position);
    f.m1.scale.setScalar(.3+f.R*e);f.m1.material.opacity=.3*(1-u);
    f.m2.scale.setScalar(.2+f.R*.6*e);f.m2.material.opacity=.4*(1-u)*(1-u);
  }
}
function updateBeam(dt){
  if(!flame||!flame.g.visible)return;
  flame.t+=dt;if(flame.t>PBEAM.TIME){flame.g.visible=false;return}
  const {A,O}=beamFrame();let L=PBEAM.LEN;
  for(let d=1;d<=PBEAM.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}   // 地面に当たったらそこまで
  if(flame.cl!==undefined)L=Math.min(L,Math.max(.5,flame.cl));flame.L=L;   // 敵の魔法とぶつかったら、ぶつかった所までに縮む
  const grow=Math.min(1,flame.t/.04),fade=Math.min(1,(PBEAM.TIME-flame.t)/.1),w=(1+Math.sin(flame.t*60)*.12)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
  for(const [m,r] of [[flame.out,PBEAM.RADIUS*.8],[flame.core,PBEAM.RADIUS*.3]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
  for(let k=0;k<7;k++){const d=Math.random()*L,sp=.1+d*.03;   // 光線の中の炎のつぶ
    addFirePart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,A.x*3,A.y*3+Math.random(),A.z*3,.25+Math.random()*.25,.1+Math.random()*.1)}
  for(let k=0;k<3;k++){const sp=12+Math.random()*6;   // 手元から前へ流れ出る炎
    addFirePart(O.x,O.y,O.z,A.x*sp+(Math.random()-.5)*1.2,A.y*sp+(Math.random()-.5)*1.2,A.z*sp+(Math.random()-.5)*1.2,.2+Math.random()*.15,.09+Math.random()*.08)}
  if(L<PBEAM.LEN)fireBurst(E.x,E.y,E.z,2,3);                           // 地面に当たった所に火花
  if(!flame.fx){flame.fx=1;if(L<PBEAM.LEN)JFX.impact(E.x,E.y,E.z,{power:1.15,shards:16,ink:true})}   // 着弾: 衝撃の輪・黒縁の破片・焦げの染み
  {const Rv=new THREE.Vector3().crossVectors(A,new THREE.Vector3(0,1,0));if(Rv.lengthSq()<1e-4)Rv.set(1,0,0);Rv.normalize();const Uv=new THREE.Vector3().crossVectors(Rv,A).normalize();
    for(let k=0;k<5;k++){const d=Math.random()*L,a=flame.t*38+d*1.6+k*1.26,r=.26+d*.035,cx=Math.cos(a)*r,sx=Math.sin(a)*r;addFirePart(O.x+A.x*d+Rv.x*cx+Uv.x*sx,O.y+A.y*d+Rv.y*cx+Uv.y*sx,O.z+A.z*d+Rv.z*cx+Uv.z*sx,A.x*6,A.y*6+1.5,A.z*6,.3+Math.random()*.3,.07+Math.random()*.08)}   // 光線にまとわりつく渦の火の粉
    if(L<PBEAM.LEN&&Math.random()<.6)addSmoke(E.x,E.y,E.z,.25+Math.random()*.25,[0x120a06,0x241410,0x3a2014])}   // 着弾点に黒い煙
  flame.tick-=dt;
  if(flame.tick<=0){flame.tick=PBEAM.TICK;creaRockHit(O,A,L,PBEAM.RADIUS*.8);
    for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);   // 光線の線に近い生き物にダメージ（奥へ行くほど少し太く）
      if(d>0&&d<L+.5&&v.addScaledVector(A,-d).length()<PBEAM.RADIUS*(.6+d/PBEAM.LEN*.6)+.4*sz&&magicHits(c)){magicHit(c,PBEAM.DMG,O.x,O.z);if(c.hp>0)applyBurnToCreature(c)}}}
}
MAGIC.add({id:'fire',name:'ファイア',emoji:'🔥',icon:MAGIC_ICONS.fire,cast:castFire});
// ---------- 水の魔法: 目の前の地面から水しぶきが噴き出す（少しの間吹き続け、近くの生き物にはダメージ） ----------
const geysers=[],waterParts=[],WATER_MAG={DIST:4,TIME:1.6,RATE:90,DMG:30,TICK:.45,RADIUS:1.3,MAXP:420};   // DIST=出る距離(m) / TIME=吹き出す秒数 / RATE=1秒あたりのしぶきの数 / DMG,TICK=ダメージと間隔(秒) / RADIUS=当たる半径(m)
const waterGeo=new THREE.SphereGeometry(1,6,5),waterMats=[0x7fcfff,0x2f6fe8,0xbfe8ff].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.85,depthWrite:false}));
const iceGeo=new THREE.TetrahedronGeometry(1),spikeGeo=new THREE.ConeGeometry(.4,1.6,5),ringGeo=new THREE.TorusGeometry(1,.28,5,12),squareGeo=new THREE.BoxGeometry(1.3,1.3,1.3);   // 粒の形: 氷=三角 / 爆破=トゲ / 操作=四角 / 支配=リング
function partGeo(mats,geo){if(geo)return geo;try{if(mats===iceMats||mats===iceMatsP)return iceGeo;if(mats===hcMats||mats===hcMatsW)return spikeGeo;if(mats===lvMats)return squareGeo;if(mats===ctlMats)return ringGeo}catch(e){}return null}   // 氷のかけら: 三角の面でできた尖った形
function addWaterPart(x,y,z,vx,vy,vz,life,size,g,mats){
  if(waterParts.length>WATER_MAG.MAXP){const o=waterParts.shift();scene.remove(o.m)}
  const mm=mats||waterMats,ice=mats===iceMats||mats===iceMatsP,spk=mats===lvMats?squareGeo:mats===ctlMats?ringGeo:(mats===hcMats||mats===hcMatsW)?spikeGeo:null,m=new THREE.Mesh(spk||(ice?iceGeo:waterGeo),mm[Math.floor(Math.random()*mm.length)]);m.position.set(x,y,z);m.scale.setScalar(ice?size*1.5:size);scene.add(m);
  const o={m,vx,vy,vz,life,max:life,size:ice?size*1.5:size,g:g===undefined?18:g};
  if(ice||spk){m.rotation.set(Math.random()*6.283,Math.random()*6.283,Math.random()*6.283);o.sx=(Math.random()-.5)*12;o.sy=(Math.random()-.5)*12}   // 三角のかけらは回りながら飛ぶ
  waterParts.push(o);
}
// 水の魔法: 噴水ではなく、正面へ一瞬だけ走る水のビーム（線上の生き物にダメージではなくマナを与える。魔力に関係なく当たると+1。プレイヤーには無効）
function giveMana(c,n){c.mana=(c.mana||0)+(n||1);c._cs=undefined}   // 魔力+1（魔法が通る基準を越えたら、魔法を使える個体の判定も更新）
const WBEAM={LEN:14,TIME:.22,TICK:.1,DMG:20,RADIUS:.6};   // LEN=届く距離(m) / TIME=出ている秒数 / TICK,DMG=ダメージの間隔(秒)とその1回の量 / RADIUS=ビームの太さ(m)
const PWBEAM={...WBEAM,MANA:1};   // プレイヤー専用（MANA=1回当たるごとに与える魔力）
let wjet=null;
function castWater(){JFX.muzzleAuto('water');
  if(!wjet){
    const geo=new THREE.CylinderGeometry(1,.3,1,12,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0x2f6fe8,.5)),core=new THREE.Mesh(geo,mk(0x9fe0ff,.85));
    g.add(out);g.add(core);g.visible=false;scene.add(g);wjet={g,out,core,t:0,tick:0};
  }
  mTint('water',wjet.out.material,0x0a3fd0);mTint('water',wjet.core.material,0x4aa0ff,.2);
  wjet.t=0;wjet.tick=0;wjet.hit=false;wjet.fx=0;wjet.g.visible=true;
}
function updateWaterBeam(dt){
  if(!wjet||!wjet.g.visible)return;
  wjet.t+=dt;if(wjet.t>PWBEAM.TIME){wjet.g.visible=false;return}
  const {A,O}=beamFrame();let L=PWBEAM.LEN;
  for(let d=1;d<=PWBEAM.LEN;d+=.5){if((solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)||O.y+A.y*d<WATER)){L=d;break}}   // 地面（水面）に当たったらそこまで
  if(wjet.cl!==undefined)L=Math.min(L,Math.max(.5,wjet.cl));wjet.L=L;   // 敵の魔法とぶつかったら、ぶつかった所までに縮む
  const grow=Math.min(1,wjet.t/.04),fade=Math.min(1,(PWBEAM.TIME-wjet.t)/.1),w=(1+Math.sin(wjet.t*70)*.1)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
  for(const [m,r] of [[wjet.out,PWBEAM.RADIUS*.8],[wjet.core,PWBEAM.RADIUS*.3]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
  for(let k=0;k<6;k++){const sp=14+Math.random()*8;   // 手元から前へ飛ぶしぶき
    addWaterPart(O.x,O.y,O.z,A.x*sp+(Math.random()-.5)*1.5,A.y*sp+(Math.random()-.5)*1.5,A.z*sp+(Math.random()-.5)*1.5,.25+Math.random()*.2,.05+Math.random()*.06,4)}
  if(L<PWBEAM.LEN)for(let k=0;k<4;k++){const a=Math.random()*6.283,sp=1+Math.random()*3;addWaterPart(E.x,E.y,E.z,Math.cos(a)*sp,2+Math.random()*3,Math.sin(a)*sp,.4+Math.random()*.3,.05+Math.random()*.06)}   // 当たった所の水しぶき
  if(!wjet.fx){wjet.fx=1;if(L<PWBEAM.LEN){JFX.impact(E.x,E.y,E.z,{power:1.05,shards:8});for(let k=0;k<28;k++){const a=Math.random()*6.283,sp=2+Math.random()*4;addWaterPart(E.x,E.y,E.z,Math.cos(a)*sp,5+Math.random()*5,Math.sin(a)*sp,.6+Math.random()*.4,.05+Math.random()*.07,16)}}}   // 着弾: 水しぶきの冠
  // 1回の詠唱につきダメージ判定は1回だけ（持続・連続ヒットなし）
  if(!wjet.hit){
    wjet.hit=true;creaRockHit(O,A,L,PWBEAM.RADIUS*.8);
    for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);
      if(d>0&&d<L+.5&&v.addScaledVector(A,-d).length()<PWBEAM.RADIUS*(.6+d/PWBEAM.LEN*.6)+.4*sz)giveMana(c,PWBEAM.MANA)}
  }
}
function updateWater(dt){
  for(let i=geysers.length-1;i>=0;i--){
    const g=geysers[i];g.t+=dt;
    if(g.t>WATER_MAG.TIME){geysers.splice(i,1);continue}
    const pw=1-g.t/WATER_MAG.TIME*.5;                               // だんだん弱くなる
    g.acc+=WATER_MAG.RATE*dt*pw;
    while(g.acc>=1){g.acc-=1;const a=Math.random()*6.283,r=Math.random()*.35,sp=Math.random()*1.6;
      addWaterPart(g.x+Math.cos(a)*r,g.y+.05,g.z+Math.sin(a)*r,Math.cos(a)*sp,(7+Math.random()*4)*pw,Math.sin(a)*sp,.9+Math.random()*.5,.07+Math.random()*.07)}   // 真上へ勢いよく
    g.tick-=dt;
    if(g.tick<=0){g.tick=WATER_MAG.TICK;for(const c of creatures){if(c.hp<=0)continue;if(Math.hypot(c.x-g.x,c.z-g.z)<WATER_MAG.RADIUS+.4*(c.size||1))magicHits(c)&&magicHit(c,WATER_MAG.DMG,g.x,g.z)}}
  }
  for(let i=waterParts.length-1;i>=0;i--){
    const p=waterParts[i];p.life-=dt;
    p.vy-=p.g*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
    if(p.life<=0||(p.vy<0&&p.m.position.y<supportAt(p.m.position.x,p.m.position.z,p.m.position.y)+.02)){scene.remove(p.m);waterParts.splice(i,1);continue}
    p.m.scale.setScalar(p.size*(.5+.5*Math.min(1,p.life/p.max*2)));if(p.sx){p.m.rotation.x+=p.sx*dt;p.m.rotation.y+=p.sy*dt}
  }
}
MAGIC.add({id:'water',name:'ウォーター',emoji:'💧',icon:MAGIC_ICONS.water,cast:castWater});
// ---------- 雷の魔法: 正面へ、角ばったギザギザの閃光がビームのように一瞬走る（当たった生き物にダメージ） ----------
const bolts=[],BOLT={LEN:22,SEG:16,JIT:.9,LIFE:.32,DMG:240,RADIUS:1.0};   // LEN=届く距離(m) / SEG=折れ曲がりの数 / JIT=ギザギザの大きさ(m) / LIFE=光っている秒数 / DMG=ダメージ / RADIUS=当たる幅(m)
const PBOLT={...BOLT};   // プレイヤー専用
const boltBox=new THREE.BoxGeometry(1,1,1);
function boltSegs(grp,pts,w,mat){for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],len=a.distanceTo(b);if(len<1e-4)continue;
  const m=new THREE.Mesh(boltBox,mat);m.position.copy(a).add(b).multiplyScalar(.5);m.lookAt(b);m.scale.set(w,w,len+w*.6);grp.add(m)}}
function castLightning(){JFX.muzzleAuto('thunder');
  const cp=Math.cos(player.pitch),A=new THREE.Vector3(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp),yw=player.yaw;
  const O=new THREE.Vector3(camera.position.x+A.x*.9+Math.cos(yw)*.25,camera.position.y+A.y*.9-.2,camera.position.z+A.z*.9-Math.sin(yw)*.25);   // 杖の先あたり（画面の右下）から
  let L=PBOLT.LEN;for(let d=1;d<=PBOLT.LEN;d+=.5){const x=O.x+A.x*d,y=O.y+A.y*d,z=O.z+A.z*d;if(solidAt(x,y,z)){L=d;break}}   // 地面に当たったらそこまで
  const R=new THREE.Vector3().crossVectors(A,new THREE.Vector3(0,1,0));if(R.lengthSq()<1e-4)R.set(1,0,0);R.normalize();const U=new THREE.Vector3().crossVectors(R,A).normalize();
  const pts=[O.clone()];
  for(let i=1;i<=PBOLT.SEG;i++){const t=i/PBOLT.SEG,j=PBOLT.JIT*(i===PBOLT.SEG?.4:1)*(.4+Math.random()*.6);
    pts.push(O.clone().addScaledVector(A,L*t).addScaledVector(R,(Math.random()-.5)*2*j).addScaledVector(U,(Math.random()-.5)*2*j))}
  const mOut=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0x7fa8ff,0x2a3cff),transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
        mCore=new THREE.MeshBasicMaterial({color:mlvCol('thunder',0xffffff,0x8fb0ff),transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
  const g=new THREE.Group();
  boltSegs(g,pts,.16,mOut);boltSegs(g,pts,.05,mCore);
  for(let b=0;b<3;b++){const k=2+Math.floor(Math.random()*(PBOLT.SEG-5)),side=Math.random()<.5?1:-1,bp=[pts[k].clone()];   // 枝分かれ: 途中から横へ短く折れ曲がる
    for(let i=1;i<=4;i++)bp.push(bp[i-1].clone().addScaledVector(A,.9+Math.random()*.6).addScaledVector(R,side*(.5+Math.random()*1.1)).addScaledVector(U,(Math.random()-.5)*1.4));
    boltSegs(g,bp,.09,mOut);boltSegs(g,bp,.03,mCore)}
  scene.add(g);bolts.push({g,mOut,mCore,t:0,mine:true,O:O.clone(),A:A.clone(),L});creaRockHit(O,A,L,PBOLT.RADIUS*.5);
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||1)-O.y,c.z-O.z),d=v.dot(A);   // ビームの線に近い生き物にダメージ
    if(d>0&&d<L+.5&&v.clone().addScaledVector(A,-d).length()<PBOLT.RADIUS+.4*sz)magicHits(c)&&magicHit(c,PBOLT.DMG,O.x,O.z)}
  fireBurst(pts[PBOLT.SEG].x,pts[PBOLT.SEG].y,pts[PBOLT.SEG].z,10,4);   // 先端に火花
  {const E=pts[PBOLT.SEG],hitG=L<PBOLT.LEN;JFX.impact(E.x,E.y,E.z,hitG?{power:1.4,shards:16,dome:true,ink:true,arcs:6}:{power:.8,shards:6,ring:false,ground:false,shake:false,arcs:3})}   // 着弾: 光のドーム・地面を走る稲妻・破片
}
function updateLightning(dt){
  for(let i=bolts.length-1;i>=0;i--){const b=bolts[i];b.t+=dt;
    const LF=b.life||PBOLT.LIFE;if(b.t>LF){scene.remove(b.g);b.mOut.dispose();b.mCore.dispose();bolts.splice(i,1);continue}
    const k=1-b.t/LF;b.g.visible=Math.random()<.85;b.mOut.opacity=.75*k;b.mCore.opacity=k}   // ちかちか光って消える
}
MAGIC.add({id:'thunder',name:'サンダー',emoji:'⚡',icon:MAGIC_ICONS.thunder,cast:castLightning});
// ---------- 氷の魔法: 目の前の生き物を青くして凍らせる。動けなくなり、しばらくすると解ける ----------
const ICE={RANGE:12,R:3,CRE_TIME:8,MAX:3,BLUE:.7,COL:new THREE.Color(0x8fd8ff)},iceMats=[0xe8f8ff,0x9fdcff,0xffffff].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false}));   // RANGE=届く距離(m) / R=当たった場所から凍る範囲(m) / CRE_TIME=生き物が凍る秒数 / MAX=凍る時間の上限(秒・生き物もプレイヤーも) / BLUE=青くする強さ
const PICE={...ICE},iceMatsP=[0xe8f8ff,0x9fdcff,0xffffff].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false}));   // プレイヤー専用の氷のかけら（レベルで色が濃くなる。敵のiceMatsとは別）   // プレイヤー専用
function castIce(){JFX.muzzleAuto('ice');
  iceMatsP.forEach((m,i)=>mTint('ice',m,[0x3aa6e8,0x1c6fd0,0x9fd8ff][i],.1));
  const cp=Math.cos(player.pitch),A=new THREE.Vector3(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp),yw=player.yaw,cam=camera.position;
  const O=new THREE.Vector3(cam.x+A.x*.9+Math.cos(yw)*.25,cam.y+A.y*.9-.2,cam.z+A.z*.9-Math.sin(yw)*.25);
  let T=PICE.RANGE;                                                    // 当たる距離: 視線上で最初にぶつかる 生き物・木・岩・地面
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-cam.x,c.y+sz*(c.hy||.95)-cam.y,c.z-cam.z),d=v.dot(A);
    if(d>0&&d<T&&v.addScaledVector(A,-d).length()<HIT_R*sz+.3)T=d}
  const ccx=Math.floor(cam.x/CHUNK),ccz=Math.floor(cam.z/CHUNK),near=[];
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const c=chunks.get((ccx+i)+','+(ccz+j));if(c&&c.userData)near.push(c.userData)}
  for(const u of near){
    for(const tr of u.trees||[]){const rad=tr.r*tr.sx+.3,hh=Math.min(tr.th*tr.sy,4.5);
      for(let d=1;d<T;d+=.5){const x=cam.x+A.x*d,z=cam.z+A.z*d,y=cam.y+A.y*d;if(Math.hypot(x-tr.x,z-tr.z)<rad&&y>tr.y-.2&&y<tr.y+hh){T=d;break}}}
    for(const rk of u.rocks||[]){const rx=rk.s*.9+.35,ry=rk.sy*.9+.35;
      for(let d=1;d<T;d+=.5){const x=cam.x+A.x*d,z=cam.z+A.z*d,y=cam.y+A.y*d;if(((x-rk.x)/rx)**2+((y-rk.y)/ry)**2+((z-rk.z)/rx)**2<1){T=d;break}}}
  }
  for(let d=1;d<T;d+=.5){if(solidAt(cam.x+A.x*d,cam.y+A.y*d,cam.z+A.z*d)){T=d;break}}
  iceClash={O:O.clone(),A:A.clone(),L:T,t:0};   // 氷も相殺の対象（撃った線が一瞬だけ敵の魔法とぶつかる）
  creaRockHit(cam,A,T+.3,.3);const hx=cam.x+A.x*T,hy=cam.y+A.y*T,hz=cam.z+A.z*T;               // 当たった場所
  const hr=PICE.R;
  for(const c of creatures){if(c.hp<=0||!magicHits(c))continue;if(Math.hypot(c.x-hx,c.z-hz)<hr+.5*(c.size||1)&&Math.abs((c.y+(c.size||1))-hy)<3){   // 当たった場所の近くの生き物を凍らせる
    if(!(c.frozen>0)){c.iceOld=c.mat.color.clone();c.mat.color.lerp(PICE.COL,PICE.BLUE)}c.frozen=Math.min(PICE.MAX,Math.max(c.frozen||0,PICE.CRE_TIME*magicRate(c)));applyFrostbiteToCreature(c);alarmCreatures(c)}}   // 凍らせた人は、殴られた時と同じように敵対（または逃げる）し、周りも反応する
  for(let i=eMagics.length-1;i>=0;i--){const e=eMagics[i];if(e.type==='ice'&&Math.hypot(e.H.x-hx,e.H.z-hz)<PICE.R+EMAG.ICE_R){eMagics.splice(i,1);parryFx(e.H.clone(),['ice','ice'],null);   // 敵の氷の発動場所の近くへ自分の氷を当てると、敵の氷は消える
    for(let k=0;k<24;k++){const a=Math.random()*6.283,sp=1+Math.random()*3;addWaterPart(e.H.x+Math.cos(a)*.3,e.H.y,e.H.z+Math.sin(a)*.3,Math.cos(a)*sp,1.5+Math.random()*3,Math.sin(a)*sp,.4+Math.random()*.4,.05+Math.random()*.06,9,iceMatsP)}}}
  JFX.impact(hx,hy,hz,{cols:JFX.PAL.ice,power:1.2,shards:12,spikes:9});   // 着弾: 地面から氷のトゲが突き出す
  for(let i=0;i<40;i++){const a=Math.random()*6.283,sp=1+Math.random()*3.5;                  // 当たった場所に氷のかけらが散る
    addWaterPart(hx+Math.cos(a)*.3,hy,hz+Math.sin(a)*.3,Math.cos(a)*sp,1.5+Math.random()*3.5,Math.sin(a)*sp,.5+Math.random()*.5,.05+Math.random()*.08,9,iceMatsP)}
}
MAGIC.add({id:'ice',name:'アイス',emoji:'❄️',icon:MAGIC_ICONS.ice,cast:castIce});
// ---------- 闇の魔法: 黒いもやの線が正面へ走り、最初に当たった所（生き物・地面・最大距離）に黒い火花が散る。魔力20以下の相手には効かない。当たった人は黒い丸が出て、倒さずにそのまま消える（ドロップなし）。周りの人は敵対する ----------
const DARK={LEN:16,TIME:.3,TICK:1,DMG:300,RADIUS:.5,DELAY:.08};   // LEN=届く距離(m) / TIME=出ている秒数 / DMG=ダメージ（TICKを出ている秒数より長くしてあるので、1回振って1回だけ当たる） / RADIUS=線に当たる太さ(m)
const darkMats=[0x050508,0x1a0f26,0x6a30b0].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.85,depthWrite:false})),
      sparkMats=[0x000000,0x120a1c,0x3b1a5c].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,depthWrite:false}));
let dkb=null;
function castDark(){castSnd('darkCastSample',.85);JFX.muzzleAuto('dark');
  if(!dkb){
    const geo=new THREE.CylinderGeometry(1,.35,1,10,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0x2a1040,.45)),core=new THREE.Mesh(geo,mk(0x050508,.85));
    g.add(out);g.add(core);g.visible=false;scene.add(g);dkb={g,out,core,t:0,tick:0};
  }
  mTint('dark',dkb.out.material,0x000000,.9);mTint('dark',dkb.core.material,0x000000,.2);
  dkb.t=0;dkb.tick=DARK.DELAY;dkb.cl=undefined;dkb.fx=0;   // 闇は出てから DELAY 秒たってから当たる（その間に相殺されると、ぶつかった所までに縮んで、その先の相手は消えない）
  dkb.L=DARK.LEN;dkb.g.visible=true;
}
const darkOrbs=[],darkOrbGeo=new THREE.SphereGeometry(1,16,12),darkOrbMat=()=>new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:1,depthWrite:false});
function darkVanish(c){try{JFX.impact(c.x,c.y+(c.size||1)*(c.hy||.95),c.z,{cols:JFX.PAL.dark,power:1.5,shards:18,spikes:10,ink:true})}catch(e){}                                              // 闇が当たった人: 黒い丸を出して、その人を消す（倒したのではないので、死体も落とし物も魔法石も出ない）
  if(!isAnimal(c))for(const o of creatures){                         // 周りの人は敵対する（動物が消えた時は、今まで通り人間は反応しない）。腕がなくて魔法も使えない人は戦えないので逃げる
    if(o===c||o.dead!==undefined||o.hp<=0||Math.hypot(o.x-c.x,o.z-c.z)>ALARM_R)continue;
    if(isAnimal(o)){setMood(o,'flee');continue}
    setMood(o,isArmless(o)&&!isCaster(o)?'flee':'hostile');
  }
  const sz=c.size||1,m=new THREE.Mesh(darkOrbGeo,darkOrbMat());m.position.set(c.x,c.y+sz*(c.hy||.95),c.z);m.scale.setScalar(.05);scene.add(m);
  darkOrbs.push({m,t:0,r:.9*sz});
  scene.remove(c.g);const i=creatures.indexOf(c);if(i>=0)creatures.splice(i,1);c.gm.dispose();c.mat.dispose();
}
function updateDarkOrbs(dt){                                         // 黒い丸: すばやく広がって、そのあと縮みながら消える
  for(let i=darkOrbs.length-1;i>=0;i--){
    const o=darkOrbs[i];o.t+=dt;const T1=.12,T2=.5;
    if(o.t<T1){o.m.scale.setScalar(o.r*(.15+.85*o.t/T1))}
    else if(o.t<T1+T2){const k=(o.t-T1)/T2;o.m.scale.setScalar(o.r*(1-.97*k));o.m.material.opacity=1-k}
    else{scene.remove(o.m);o.m.material.dispose();darkOrbs.splice(i,1)}
  }
}
function updateDark(dt){
  updateDarkOrbs(dt);
  if(!dkb||!dkb.g.visible)return;
  dkb.t+=dt;if(dkb.t>DARK.TIME){dkb.g.visible=false;return}
  const {A,O}=beamFrame();let L=DARK.LEN,tgt=null;
  for(let d=1;d<=DARK.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}   // 地面で止まる
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);   // 最初に当たる生き物
    if(d>0&&d<L&&v.addScaledVector(A,-d).length()<DARK.RADIUS+.4*sz){L=d;tgt=c}}
  if(dkb.cl!==undefined)L=Math.min(L,Math.max(.5,dkb.cl));dkb.L=L;   // 敵の魔法とぶつかったら、ぶつかった所までに縮む
  if(tgt){const tv=new THREE.Vector3(tgt.x-O.x,tgt.y+(tgt.size||1)*(tgt.hy||.95)-O.y,tgt.z-O.z);if(tv.dot(A)>L) tgt=null} // 相殺地点より先の対象は闇で消さない
  const grow=Math.min(1,dkb.t/.05),fade=Math.min(1,(DARK.TIME-dkb.t)/.12),w=(1+Math.sin(dkb.t*50)*.15)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
  for(const [m,r] of [[dkb.out,.3],[dkb.core,.11]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
  for(let k=0;k<6;k++){const d=Math.random()*L,sp=.15+d*.02;   // 線にそって黒いもやがただよう
    addWaterPart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,(Math.random()-.5)*.8,.3+Math.random()*.8,(Math.random()-.5)*.8,.3+Math.random()*.3,.08+Math.random()*.1,0,darkMats)}
  for(let k=0;k<7;k++){const a=Math.random()*6.283,b=(Math.random()-.5)*1.6,r=1.1+Math.random()*1.2;   // 着弾点へ黒い粒が吸い込まれる
    addWaterPart(E.x+Math.cos(a)*r,E.y+b,E.z+Math.sin(a)*r,-Math.cos(a)*r*3.4,-b*3.4,-Math.sin(a)*r*3.4,.3,.035+Math.random()*.04,0,sparkMats)}
  if(!dkb.fx){dkb.fx=1;JFX.impact(E.x,E.y,E.z,(L<DARK.LEN||tgt)?{power:1.25,shards:14,ink:true,spikes:8}:{power:.7,shards:5,ring:false,ground:false,shake:false})}   // 着弾: 黒いトゲ・インクの染み
  dkb.tick-=dt;
  if(dkb.tick<=0){dkb.tick=DARK.TICK;creaRockHit(O,A,L,DARK.RADIUS);if(tgt&&manaPassOf(tgt.mana||0)>0)darkVanish(tgt)}   // 魔力20以下の人には効かない（水・創造以外の魔法は共通）。当たった人は倒さず消す（ドロップなし）
}
MAGIC_ICONS.dark="data:image/png;base64,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";   // 渦まきのアイコン
MAGIC.add({id:'dark',name:'ダーク',emoji:'🌑',icon:MAGIC_ICONS.dark,cast:castDark});
// ---------- 操作の魔法（水の次）: 紫の線が最初に当たった人を操る。操られた人は、近くの仲間（人）に敵対して殴りかかる。殴られた仲間は、その人と敵対して反撃し、近くの人も加勢（戦えない人は逃げる）。一定時間でもとに戻る。動物には効かない ----------
const CTRL={LEN:16,TIME:.3,DUR:20,RADIUS:.5,SEEK:20,HELP:12};   // LEN=届く距離(m) / DUR=操られる秒数 / SEEK=仲間を探す距離(m) / HELP=殴られた人の周りで巻き込まれる距離(m)
const ctlMats=[0xff5fd0,0xc040ff,0xffffff].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false}));
function canFight(o){return !isAnimal(o)&&!(isArmless(o)&&!isCaster(o))}   // 剣か魔法で戦える人か
function setFoe(c,f){c.foe=f;setMood(c,canFight(c)?'hostile':'flee');c.foeMood=true;c.moodT=Math.max(c.moodT||0,12)}   // fを敵として（戦えない人は逃げる）
function foeHarm(att,v,kind,amount){                                   // 人が人を攻撃: 殴られた人はattと敵対し、近くの人もattと敵対する（プレイヤー側の警報は出さない）
  {const magic=kind==='magic';if(!(magic&&manaPassOf(v.mana||0)<=0)){const fin=magic?magicDmgTo(v,amount,1):physDmgTo(v,amount);harmCreature(v,fin,att.x,att.z,false,true,false,!magic&&fin<=0&&amount>0&&(v.def||0)>0)}}   // kind='phys'(武器・爪の攻撃力) / 'magic'(撃った側のマナ倍率をかけ済みのダメージ)。物理度・マナ・防御力はここで計算
  if(v.hp<=0||creatures.indexOf(v)<0||isZombie(v))return;   // ゾンビは殴られても仲間や周りの人を巻き込まない
  setFoe(v,att);
  for(const o of creatures){
    if(o===v||o===att||o.dead!==undefined||o.hp<=0||isAnimal(o)||isZombie(o)||Math.hypot(o.x-v.x,o.z-v.z)>CTRL.HELP)continue;
    setFoe(o,att);
  }
}
function foeHit(c){                                                  // 振り下ろした瞬間: 相手の人に当たるか
  const f=c.foe;if(!f||f.hp<=0)return;const d=Math.hypot(f.x-c.x,f.z-c.z);
  if(isCaster(c)){if(d<=EMAG.RANGE+1){fireBurst(f.x,f.y+(f.size||1)*.95,f.z,10,4);foeHarm(c,f,'magic',BEAM.DMG*enemyPower(c))}}   // 魔法の人: 火の威力×魔力÷100
  else if(c.dagger&&c.wAtk!==undefined){if(d<1.9)foeHarm(c,f,'phys',c.wAtk)}   // 部族の石の短剣: 武器の攻撃力ぶんのダメージ（即死ではない）
  else if(d<(c.lance?3.6:c.spear?2.7:2.2)){                                      // 剣・槍は武器の攻撃力ぶんのダメージ（プレイヤーが受ける時と同じ計算）
    foeHarm(c,f,'phys',enemyAtk(c));   // 武器の攻撃力ぶんのダメージ（相手の物理度・防御力で減る）
  }
}
// ---------- ゾンビと人間: ゾンビは近くの人間にも襲いかかる。人間はゾンビが近づくと、戦える人（勇気が高い・傭兵と騎士は必ず）は戦い、それ以外は逃げる。幽霊は剣が効かないので、魔法の人以外は逃げる。戦いが終わったら元に戻る ----------
const ZH={SEE:14,TICK:.4};let zhT=0;
function zombieHumanTick(dt){
  zhT-=dt;if(zhT>0)return;zhT=ZH.TICK;
  let zs=null;for(const z of creatures)if(isZombie(z)&&z.dead===undefined&&z.hp>0)(zs||(zs=[])).push(z);
  if(!zs)return;
  for(const h of creatures){
    if(isZombie(h)||isAnimal(h)||h.dead!==undefined||h.hp<=0||h.foe||h.mood||h.lev||h.rider||h.ctrl>0)continue;   // 操られている人・すでに敵対や逃走中の人は、そのまま
    let z=null,bd=ZH.SEE;for(const o of zs){const d=Math.hypot(o.x-h.x,o.z-h.z);if(d<bd){bd=d;z=o}}
    if(!z)continue;
    if(h.brave===undefined)h.brave=(h.kind==='merc'||h.kind==='dmerc'||h.kind==='cav'||h.kind==='mamluk')?1:Math.random();
    const fight=canFight(h)&&h.brave>.5&&!(isGhost(z)&&!isCaster(h));
    h.foe=z;setMood(h,fight?'hostile':'flee');h.foeMood=true;h.moodT=Math.max(h.moodT||0,8);
  }
}
function ctrlUpdate(c,dt){                                           // 毎フレーム: 相手が消えたら外す / 操られている間は仲間を探して敵対
  const f=c.foe;
  if(f&&(f.hp<=0||f.dead!==undefined||creatures.indexOf(f)<0||Math.hypot(f.x-c.x,f.z-c.z)>40)){
    c.foe=null;
    if(c.foeMood&&!(c.ctrl>0)){c.foeMood=false;c.mood=null;c.spd=1;c.swT=-1;c.wait=1+Math.random()*2;if(c.guard){c.tx=c.hx;c.tz=c.hz;c.wait=0}}   // 操られた人との戦いだけで敵対していた人は、戦いが終わったらプレイヤーに敵対せず、もとに戻る（プレイヤーに殴られて敵対した人はそのまま）
  }
  if(!(c.ctrl>0))return;
  c.ctrl-=dt;
  if(c.ctrl<=0){c.ctrl=0;c.foe=null;c.mood=null;c.spd=1;c.wait=1;return}
  if(!c.foe){let best=null,bd=CTRL.SEEK;for(const o of creatures){if(o===c||o.hp<=0||o.dead!==undefined||isAnimal(o))continue;const d=Math.hypot(o.x-c.x,o.z-c.z);if(d<bd){bd=d;best=o}}if(best)setFoe(c,best)}
  if(c.foe)c.moodT=Math.max(c.moodT||0,3);
  if(Math.random()<dt*14){const sz=c.size||1;addWaterPart(c.x+(Math.random()-.5)*.5*sz,c.y+sz*1.9,c.z+(Math.random()-.5)*.5*sz,0,.8,0,.6,.06+Math.random()*.04,0,ctlMats)}   // 頭の上に紫のきらめき
}
let ctb=null;
function castControl(){JFX.muzzleAuto('c');
  if(!ctb){
    const geo=new THREE.CylinderGeometry(1,.35,1,10,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0xc040ff,.5)),core=new THREE.Mesh(geo,mk(0xffd6f6,.85));
    g.add(out);g.add(core);g.visible=false;scene.add(g);ctb={g,out,core,t:0,hit:false};
  }
  mTint('c',ctb.out.material,0x7a10c0);mTint('c',ctb.core.material,0xff7ad8,.1);
  ctb.t=0;ctb.hit=false;ctb.cl=undefined;ctb.g.visible=true;
}
function updateControl(dt){
  if(!ctb||!ctb.g.visible)return;
  ctb.t+=dt;if(ctb.t>CTRL.TIME){ctb.g.visible=false;return}
  const {A,O}=beamFrame();let L=CTRL.LEN,tgt=null;
  for(let d=1;d<=CTRL.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}if(ctb.cl!==undefined)L=Math.min(L,ctb.cl);
  for(const c of creatures){if(c.hp<=0||c.dead!==undefined||isAnimal(c))continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);   // 最初に当たる人（動物は素通り）
    if(d>0&&d<L&&v.addScaledVector(A,-d).length()<CTRL.RADIUS+.4*sz){L=d;tgt=c}}
  const grow=Math.min(1,ctb.t/.05),fade=Math.min(1,(CTRL.TIME-ctb.t)/.12),w=(1+Math.sin(ctb.t*50)*.15)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
  for(const [m,r] of [[ctb.out,.3],[ctb.core,.11]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
  for(let k=0;k<6;k++){const d=Math.random()*L,sp=.15+d*.02;
    addWaterPart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,(Math.random()-.5)*.8,.3+Math.random()*.8,(Math.random()-.5)*.8,.3+Math.random()*.3,.06+Math.random()*.06,0,ctlMats)}
  creaRockHit(O,A,L,CTRL.RADIUS);if(!ctb.hit&&tgt){ctb.hit=true;if(manaPassOf(tgt.mana||0)<=0){if(typeof gameToast==='function')gameToast('魔力が低くて操れない')}else{tgt.ctrl=CTRL.DUR;tgt.foe=null;if(typeof gameToast==='function')gameToast('人を操った')}}   // 1回の詠唱で1人だけ
}
MAGIC.add({id:'b',name:'コントロール',emoji:'🌀',cast:(...a)=>castLevit(...a)});   // 見た目・効果を支配（持ち上げて投げる）と入れ替え中

// ---------- 高エネルギー魔法（火と雷の次）: 一瞬だけ走る、真っ白な芯のレーザーのようなビーム。当たった所で閃光・衝撃波・火花が出て、地面なら焼け跡が残る。魔力が低い生き物には、他の魔法と同じく効かない ----------
const BLAST={CHARGE:0,TIME:.22,TICK:9,DMG:600,LEN:38,RADIUS:1.2};   // TIME=光っている秒数(一瞬) / DMG=当たった時の1回のダメージ(魔力に応じて通る割合は他の魔法と同じ) / LEN=届く距離(m) / RADIUS=太さ(m) / CHARGE=ため時間(0=ためずに即発射)
const PBLAST={...BLAST};   // プレイヤー専用（レベルで強化。敵の魔法は元の値のまま）
const blastMats=[0xffffff,0xfff6c8,0xffe45a].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
const blastFlash=document.createElement('div');blastFlash.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:49;opacity:0;background:radial-gradient(circle at 60% 70%,rgba(255,255,255,.9),rgba(190,215,255,.4) 50%,rgba(0,0,0,0) 80%)';document.body.appendChild(blastFlash);
let blast=null,scorch=null;
const glowMat=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function castBlast(){JFX.muzzleAuto('a');
  if(!blast){
    const geo=new THREE.CylinderGeometry(1,1,1,24,1,true);geo.rotateX(Math.PI/2);   // 細い円柱を何枚も重ねて、芯が真っ白で外へ向かって青白くにじむ光にする（+Z方向へのびる）
    const g=new THREE.Group(),layers=[[.07,1,0xffffff],[.16,.7,0xfff6c8],[.34,.3,0xffe45a],[.7,.13,0xffc020]].map(([r,o,c])=>{const m=new THREE.Mesh(geo,glowMat(c,o));g.add(m);return{m,r,o}});
    g.visible=false;scene.add(g);
    const flare=new THREE.Mesh(fireGeo,glowMat(0xffffff,1)),hit=new THREE.Mesh(fireGeo,glowMat(0xfff6c8,1)),ring=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),glowMat(0xfff6c8,1));
    flare.visible=hit.visible=ring.visible=false;scene.add(flare);scene.add(hit);scene.add(ring);
    const sc=new THREE.Mesh(new THREE.CircleGeometry(1,24),glowMat(0xff7a20,.8));sc.rotation.x=-Math.PI/2;sc.visible=false;scene.add(sc);scorch={m:sc,t:9};   // 地面に当たった所の焼け跡(赤く光って冷める)
    blast={g,layers,flare,hit,ring,t:0,tick:0,on:false,fired:false};
  }
  blast.layers.forEach((l,i)=>{mTint('a',l.m.material,[0xfff0b0,0xffd040,0xff9a10,0xff6a00][i],0);if(l.o0===undefined)l.o0=l.o;l.o=Math.min(1,l.o0*(1+mlvT('a')))});
  blast.t=0;blast.tick=0;blast.on=true;blast.fired=false;blast.cl=undefined;
}
function updateBlast(dt){
  if(scorch&&scorch.t<1.6){scorch.t+=dt;const k=Math.max(0,1-scorch.t/1.6);scorch.m.material.opacity=.8*k*k;scorch.m.visible=k>0}
  if(!blast||!blast.on)return;
  blast.t+=dt;const bt=blast.t,{A,O}=beamFrame();
  if(bt>PBLAST.TIME){blast.on=false;blast.g.visible=false;blast.flare.visible=blast.hit.visible=blast.ring.visible=false;return}
  let L=PBLAST.LEN,ground=false;for(let d=1;d<=PBLAST.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;ground=true;break}}if(blast.cl!==undefined)L=Math.min(L,blast.cl);   // 地面に当たったらそこまで
  const E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
  if(!blast.fired){blast.fired=true;JFX.impact(E.x,E.y,E.z,{cols:JFX.PAL.a,power:1.3,shards:16,dome:ground,ink:ground});blastFlash.style.transition='none';blastFlash.style.opacity=.55;void blastFlash.offsetWidth;blastFlash.style.transition='opacity .3s';blastFlash.style.opacity=0;   // 放った瞬間に画面が白く光る
    for(let k=0;k<22;k++)addFirePart(E.x,E.y,E.z,(Math.random()-.5)*11,Math.random()*8,(Math.random()-.5)*11,.35+Math.random()*.4,.05+.07*Math.random());   // 当たった所から赤熱した火花が飛び散る
    if(ground){scorch.t=0;scorch.m.position.set(E.x,supportAt(E.x,E.z,E.y)+.05,E.z);scorch.m.scale.setScalar(1.3);scorch.m.material.opacity=.8;scorch.m.visible=true}}
  const f=bt<PBLAST.TIME*.35?1:Math.max(0,1-(bt-PBLAST.TIME*.35)/(PBLAST.TIME*.65)),fl=.88+Math.random()*.12,ramp=Math.min(1,bt/.015);   // 光は一瞬でフル出力になり、すぐ細って消える
  blast.g.visible=true;
  for(const l of blast.layers){l.m.position.copy(M);l.m.lookAt(E);const r=l.r*ramp*(l.r<.2?fl:1);l.m.scale.set(r,r,L);l.m.material.opacity=l.o*f}
  blast.flare.visible=true;blast.flare.position.copy(O);blast.flare.scale.setScalar(.22+Math.random()*.08);blast.flare.material.opacity=f;   // 発射口の光
  blast.hit.visible=true;blast.hit.position.copy(E);blast.hit.scale.setScalar(.9+bt*4);blast.hit.material.opacity=.85*f;                         // 当たった所の光
  const up=ground?new THREE.Vector3(0,1,0):A;blast.ring.visible=true;blast.ring.position.copy(E);if(ground)blast.ring.position.y+=.1;blast.ring.lookAt(blast.ring.position.x+up.x,blast.ring.position.y+up.y,blast.ring.position.z+up.z);
  blast.ring.scale.setScalar(.5+bt/PBLAST.TIME*7);blast.ring.material.opacity=.9*f;                                                              // 衝撃波の輪が広がる
  for(let k=0;k<4;k++){const d=Math.random()*L;addFirePart(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d,(Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2,.15+Math.random()*.15,.04+Math.random()*.04,blastMats)}   // ビームの周りで空気が光る
  for(let k=0;k<3;k++)addFirePart(E.x,E.y,E.z,(Math.random()-.5)*9,Math.random()*7,(Math.random()-.5)*9,.3+Math.random()*.3,.04+.06*Math.random());   // 火花
  blast.tick-=dt;
  if(blast.tick<=0){blast.tick=PBLAST.TICK;creaRockHit(O,A,L,PBLAST.RADIUS*.6);
    for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);
      if(d>0&&d<L+.5&&v.addScaledVector(A,-d).length()<PBLAST.RADIUS*(.8+d/PBLAST.LEN*.4)+.4*sz){
        if(magicHits(c))magicHit(c,PBLAST.DMG,O.x,O.z);
        else for(let k=0;k<2;k++)addFirePart(c.x,c.y+sz*(c.hy||.95),c.z,(Math.random()-.5)*5,Math.random()*3,(Math.random()-.5)*5,.25,.07,blastMats)}}   // 魔力が低い相手には効かず、光がはじかれるだけ
  }
}
MAGIC.add({id:'a',name:'ブラスト',emoji:'💥',cast:castBlast});
// ---------- 敵の魔法: 腕がない形の人（砂漠の人・西洋の王・砂漠の王・砂漠の聖職者 = 人間ベース4/5の形）で、魔力が21以上の個体は、敵対すると剣のかわりに杖を振って魔法（火・雷・氷のどれか。水は使わない）で反撃する。見た目はプレイヤーの魔法と同じ。狙いは振り始めた時のプレイヤーの位置に固定（動けばよけられる） ----------
// EMAG.CHARGE=撃つ前に光を集める時間(秒)。光りきった瞬間に敵が先に撃つ / DELAY=光りきってから撃つまでの待ち(秒・通常0) / BSPEED=火・水のビームの先端が進む速さ(m/秒)。1000なら一瞬で届く（従来どおり）。12くらいにすると先端が伸びて届くまでの間に相殺できる / LOCK=光る直前、この秒数だけ狙いを固める（それまではプレイヤーを追う） / COL=光の色（魔法の種類の目印）
// EMAG.SPEED=光った後の振り下ろしの速さ（1で従来の速さ・大きいほど速い）
const EMAG={CHARGE:.72,DELAY:.3,BSPEED:100,LOCK:.2,COL:{fire:0xff8a2a,thunder:0x8fb4ff,ice:0xbfe8ff,water:0x2f6fe8,blast:0xffe45a},SPEED:4,RANGE:13,KEEP:8,WAIT:[2.5,2],TIME:.22,ICE_WARN:.5,ICE_R:1.6,FREEZE:2.5,TYPES:['fire','thunder','ice'],DMG:{fire:BEAM.DMG,thunder:BOLT.DMG,blast:BLAST.DMG,ice:0,water:0}};   // 威力はプレイヤーの魔法と同じ（火・雷）。氷はプレイヤーの氷と同じでダメージなし（凍る時間が魔力に比例）。実際の出力は 魔力÷100 をかける（魔力35なら35%）
//   // RANGE=撃ってくる距離(m) / KEEP=撃たない間に保つ距離(m) / WAIT=次に撃つまでの秒数 [最短, 幅] / ICE_WARN=氷が当たるまでの秒数(足元の予兆) / ICE_R=氷が当たる範囲(m) / FREEZE=プレイヤーが固まる秒数 / DMG=体力が減る量（魔力が高いほど強く、魔力100以上で全部）
const iceEl=document.createElement('div');iceEl.style.cssText='position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 110px 40px rgba(120,200,255,.65);background:rgba(160,220,255,.12);opacity:0;transition:opacity .35s;z-index:49';document.body.appendChild(iceEl);
function isArmless(c){const K=CRE_KINDS[c.kind];return !!K&&(K.key==='HUMAN4_B64'||K.key==='HUMAN5_B64')}   // 腕がない形（人間ベース4・5）か
function isCaster(c){                                               // 腕がない形で、魔法が通る魔力（21以上）の個体か
  if(c._cs===undefined)c._cs=isArmless(c)&&(c.mana||0)>MAGIC_RESIST;
  return c._cs;
}
function eDelay(c){return (c.spell==='thunder'||c.spell==='ice')?0:EMAG.DELAY}   // 光ってから撃つまでの待ち（相殺のタイミング）。雷は光る＝稲妻が出て当たるまでBWAITがあり、氷は足元の予兆があるので待ちなし
function eLock(c){return eDelay(c)>0?0:EMAG.LOCK}   // 待ちがある魔法は「光った瞬間に狙いが固まる」。待ちがない魔法は光る直前に固める
function enemyPower(c){return (c.mana||0)/100}   // 魔法の威力の倍率: 魔力÷100（21なら0.21倍・145なら1.45倍）
function keepDist(c){return isCaster(c)?EMAG.KEEP:HOSTILE_KEEP+(c.lance?1.2:c.spear?.8:c.dagger?-.3:0)}   // 敵対中に保つ間合い
function prepEnemyMagic(c){                                         // 振り始め: 使う魔法を選び、今のプレイヤーの位置を狙いに決める
  c.spell=EMAG.TYPES[Math.floor(Math.random()*EMAG.TYPES.length)];
  c.aim={x:player.x,y:player.y-.7,z:player.z};
  c.mgC=0;startEnemyCharge(c);   // 光を集め始める（EMAG.CHARGE秒後に光って、その瞬間に撃つ）
}
function wandTip(c){                                                // 今の杖の先（ワールド座標）
  if(c.gkLightA)return c.gkLightA.getWorldPosition(new THREE.Vector3());   // ゲートキーパー: 魔法はどれも、素手=頭上 / 杖=杖の先 / 剣=剣先から出る（相殺で撃つ魔法も同じ）
  if(!c.sword)return new THREE.Vector3(c.x,c.y+1.4*(c.size||1),c.z);
  c.g.updateMatrixWorld(true);return c.sword.localToWorld(new THREE.Vector3(0,1,0));
}
function playerOnLine(O,A,L,r){                                     // プレイヤーが 杖の先Oから向きAへ長さLの線の近く(半径r)にいるか
  const v=new THREE.Vector3(player.x-O.x,player.y-.6-O.y,player.z-O.z),d=v.dot(A);
  return d>0&&d<L+.5&&v.addScaledVector(A,-d).length()<r;
}
const eMagics=[],emGeo=(()=>{const g=new THREE.CylinderGeometry(1,.3,1,12,1,true);g.rotateX(Math.PI/2);return g})();
const emMk=(c,o,add)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false,side:THREE.DoubleSide});
const emMat={fire:[emMk(0xff6a14,.5,true),emMk(0xffe9a0,.85,true)],water:[emMk(0x2f6fe8,.5),emMk(0x9fe0ff,.85)],blast:[emMk(0xffe45a,.55,true),emMk(0xffffff,.95,true)]};   // ブラスト（ゴーレム）は青白い光の外側＋真っ白な芯   // 火・水のビームの見た目はプレイヤーの魔法と同じ色
// ---------- 敵の魔法の見た目・溜めの光・ダメージへ、ゲートキーパーの属性（a〜e・闇）を足す（gatekeeper.js の最後に移動） ----------
// ---------- 敵の魔法の溜め: 撃つ前に杖の先（ゴーレムは両こぶしの間）へ光が集まって大きくなり、いちばん光った瞬間に魔法が出る。光の色で魔法の種類がわかる。この光った瞬間が相殺のタイミング ----------
const eCharge=[],eFlash=[],eCue=[],EFLASH_T=.2;let eGlowTex=null;const eGlowMats={};
const cueEl=document.createElement('div');cueEl.style.cssText='position:fixed;inset:0;pointer-events:none;opacity:0;z-index:48;transition:opacity .06s';document.body.appendChild(cueEl);   // 光った合図: 画面のふちが魔法の色に光る（撃つ瞬間まで）
function justCue(c,type){                                           // 光ってから撃つまで（相殺のタイミング）の合図: 光のまわりの輪が杖の先へ縮んでいき、閉じた瞬間に撃つ
  const d=type==='blast'?EMAG.DELAY:eDelay(c);if(!(d>0))return;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:getRingTex(),color:0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,transparent:true}));
  sp.renderOrder=20;sp.position.copy(chargePos(c));sp.scale.setScalar(.01);scene.add(sp);eCue.push({c,sp,t:0,d,S:c.size||1,type});
}
function eGlowMat(type){
  if(!eGlowTex){const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d'),rg=g.createRadialGradient(32,32,0,32,32,32);rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.3,'rgba(255,255,255,.65)');rg.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=rg;g.fillRect(0,0,64,64);eGlowTex=new THREE.CanvasTexture(cv)}
  return eGlowMats[type]||(eGlowMats[type]=new THREE.SpriteMaterial({map:eGlowTex,color:EMAG.COL[type]||(typeof PCOL!=='undefined'&&PCOL[type])||0xffffff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
}
function chargeType(c){if(c.mage)return c.spell||'fire';return (c.G||c.golem)?'blast':(c.spell||'fire')}
function holdingCharge(c){return (c.mgF!==undefined&&c.swT>=0)||(c.bT>=chT(c)&&!c.bShot)}   // 光りきってから撃つまでの間か
function chargeRatio(c){                                           // 溜めの進み具合 0〜1（溜めていなければ -1）
  if(holdingCharge(c))return 1;                                     // 光りきって、撃つのを待っている間
  if(c.bT>=0&&c.bT<chT(c))return c.bT/chT(c);
  if(c.gkCH&&c.spT>=0&&c.spAtk&&(c.spPre>0||(c.spAtk.atk==='spears'&&c.spT<c.gkCH)))return Math.min(1,c.spPre>0?1-c.spPre/c.gkCH:c.spT/c.gkCH);   // ゲートキーパーの追加属性の攻撃の溜め           // ゴーレム（歩行型）の両手を上げて溜める間
  if(c.mgC!==undefined&&c.swT>=0)return Math.min(1,c.mgC/EMAG.CHARGE);
  return -1;
}
function chargePos(c){                                             // 光が集まる場所: 杖の先 / ゴーレムは両こぶしの間
  if(c.gkLightA)return c.gkLightA.getWorldPosition(new THREE.Vector3());   // ゲートキーパー: 素手=頭上 / 杖=杖の先 / 剣=剣先
  if(c.inspector&&c.G&&c.G.fists[c.castArm]){return c.G.fists[c.castArm].getWorldPosition(new THREE.Vector3())}   // 調査員: 撃つ1本の手の先
  if(c.G&&c.G.fists){const a=new THREE.Vector3(),b=new THREE.Vector3();c.G.fists[0].getWorldPosition(a);c.G.fists[1].getWorldPosition(b);return a.add(b).multiplyScalar(.5)}
  return wandTip(c);
}
function startEnemyCharge(c){
  if(eCharge.some(e=>e.c===c))return;
  const type=chargeType(c),orb=new THREE.Sprite(eGlowMat(type).clone()),motes=[];
  orb.scale.setScalar(.1);orb.visible=false;scene.add(orb);
  const gk=!!c.gkLightA,own=[];let halo=null;   // ゲートキーパー: 光を大きく・明るく・体や頭に隠れないように描く（光の玉の外に、ぼんやりした光の輪も付ける）
  if(gk){orb.material.depthTest=false;orb.renderOrder=25;halo=new THREE.Sprite(eGlowMat(type).clone());halo.material.depthTest=false;halo.renderOrder=24;halo.visible=false;scene.add(halo)}
  for(let i=0;i<(gk?18:8);i++){const d=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5);if(d.lengthSq()<1e-3)d.set(1,0,0);
    let mt=eGlowMat(type);if(gk){mt=mt.clone();mt.depthTest=false;own.push(mt)}
    const s=new THREE.Sprite(mt);s.scale.setScalar(.1);s.visible=false;if(gk)s.renderOrder=25;scene.add(s);motes.push({s,d:d.normalize(),ph:Math.random()})}   // 外から中心へ吸い込まれる光のつぶ
  eCharge.push({c,t:0,orb,motes,halo,own});
}
function enemyFlash(O,type,S,mono){                                     // 光った瞬間: 色つきの光の輪と白い芯がぱっと広がって消える
  const a=new THREE.Sprite(eGlowMat(type).clone()),b=new THREE.Sprite(eGlowMat(mono?type:'white').clone());
  if(mono){for(const q of [a,b]){q.material.color.setHex(PCOL[type]||0xffffff);q.material.blending=pBlend(type);q.material.depthTest=false;q.renderOrder=30;q.material.needsUpdate=true}}   // ビームの白い芯より手前に描く（深度を無視）
  a.position.copy(O);b.position.copy(O);a.scale.setScalar(S*2.2);b.scale.setScalar(S*1.2);scene.add(a);scene.add(b);eFlash.push({a,b,S,t:0});
  if(!mono)fireBurst(O.x,O.y,O.z,6,3);   // 相殺の閃光（mono）の時は火の粉を出さない
}
function updateEnemyCharge(dt){
  shakeT=Math.max(0,shakeT-dt);updatePSparks(dt);
  for(let i=eRings.length-1;i>=0;i--){const r=eRings[i];r.t+=dt;const q=r.t/(r.d||.3);if(q>=1){scene.remove(r.s);r.s.material.dispose();eRings.splice(i,1);continue}r.s.scale.setScalar(.6+(r.R||7)*(1-(1-q)*(1-q)));r.s.material.opacity=1-q}
  for(let i=eCharge.length-1;i>=0;i--){
    const e=eCharge[i],c=e.c,k=chargeRatio(c);
    if(k<0||c.dead!==undefined||c.hp<=0){for(const m of e.motes)scene.remove(m.s);scene.remove(e.orb);e.orb.material.dispose();if(e.halo){scene.remove(e.halo);e.halo.material.dispose()}if(e.own)for(const m of e.own)m.dispose();eCharge.splice(i,1);continue}   // 撃った・倒された・やめた → 片づける
    const vis=c.mood==='hostile'||c.bT>=0,S=c.size||1;
    e.orb.visible=vis;if(e.halo)e.halo.visible=vis;for(const m of e.motes)m.s.visible=vis;
    if(!vis)continue;
    e.t+=dt;const O=chargePos(c),q=k*k,pulse=k>=1?1.15+.3*Math.sin(e.t*60):1+.12*Math.sin(e.t*38);
    const K=e.halo?2.4:1,base=e.halo?.3:.12;   // K=ゲートキーパーの光の大きさの倍率
    e.orb.position.copy(O);e.orb.scale.setScalar((base+.6*q)*S*K*pulse);e.orb.material.opacity=e.halo?.75+.25*k:.35+.65*k;   // だんだん大きく明るく
    if(e.halo){e.halo.position.copy(O);e.halo.scale.setScalar((base+.6*q)*S*K*pulse*2.2);e.halo.material.opacity=.25+.35*k}   // 外側のぼんやりした光の輪
    for(const m of e.motes){const u=(e.t*(1.6+2.4*k)+m.ph)%1,R=(.15+1.1*(1-u))*S*K*(1.1-.5*k);   // 溜まるほど速く集まる
      m.s.position.set(O.x+m.d.x*R,O.y+m.d.y*R,O.z+m.d.z*R);m.s.scale.setScalar(.09*S*K*(.3+.7*(1-u)));if(e.halo)m.s.material.opacity=.6+.4*k}
  }
  let cueOn=0,cueCol=0xffffff;
  for(let i=eCue.length-1;i>=0;i--){
    const u=eCue[i],c=u.c;u.t+=dt;
    if(u.t>=u.d||c.hp<=0||c.dead!==undefined||!holdingCharge(c)){scene.remove(u.sp);u.sp.material.dispose();eCue.splice(i,1);continue}   // 撃った・倒された → 片づける
    const q=u.t/u.d;u.sp.position.copy(chargePos(c));u.sp.scale.setScalar(u.S*(3.4*(1-q)+.5));u.sp.material.opacity=.45+.55*q;   // 輪が縮む（閉じた瞬間に撃つ）
    const eo=eCharge.find(e=>e.c===c);if(eo&&eo.orb)eo.orb.material.color.setHex(0xffffff);   // 光の玉が白く脈打つ（今が相殺のタイミング）
    cueOn=Math.max(cueOn,.35+.45*q);cueCol=EMAG.COL[u.type]||0xffffff;
  }
  cueEl.style.boxShadow=cueOn>0?'inset 0 0 70px 22px #'+cueCol.toString(16).padStart(6,'0'):'none';cueEl.style.opacity=cueOn;
  for(let i=eFlash.length-1;i>=0;i--){
    const f=eFlash[i];f.t+=dt;const q=f.t/EFLASH_T;
    if(q>=1){scene.remove(f.a);scene.remove(f.b);f.a.material.dispose();f.b.material.dispose();eFlash.splice(i,1);continue}
    f.a.scale.setScalar(f.S*(2.2+4*q));f.b.scale.setScalar(f.S*(1.2+1.6*q));f.a.material.opacity=f.b.material.opacity=1-q*q;
  }
}
// ---------- 弾いた時の演出: 相殺が決まった瞬間、ぶつかった所で大きな閃光と衝撃波の輪・火花が弾け、画面が一瞬白く光って揺れ、敵は後ろへよろめく ----------
let ringTex=null;const eRings=[];
const parryEl=document.createElement('div');parryEl.style.cssText='position:fixed;inset:0;pointer-events:none;opacity:0;z-index:49';document.body.appendChild(parryEl);
const PCOL={fire:0xff6a14,water:0x2f6fe8,thunder:0x5f8fff,dark:0x2a1040,ice:0x8fd8ff,blast:0xffe45a,control:0xc040ff,hectrl:0xe01818,levit:0x3de0c0,creation:0x3a9bff};   // 相殺演出は各魔法本来のエフェクト色に合わせる
// ---------- 相殺演出の色に、ゲートキーパーの通常攻撃の属性（a〜e）を足す（gatekeeper.js の最後に移動） ----------
const pBlend=type=>THREE.NormalBlending;   // 加算合成だと重なって白く飛ぶので、全部通常合成
const pSparks=[],pSparkGeo=new THREE.BoxGeometry(.05,.05,1),pSparkMats={};
const PSPARK={N:170,V:[26,62],LIFE:[.5,.95],DRAG:1.1,GRAV:5};   // 相殺の火花: N=数 / V=飛ぶ速さ(m/秒の幅) / LIFE=残る秒数の幅 / DRAG=空気抵抗 / GRAV=落ちる勢い
function parrySparks(X,type,num){                                      // 衝突点から四方八方へ、細長い火花が大きく速く飛び散る
  const col=PCOL[type]||0xffffff,key=type;
  const mat=pSparkMats[key]||(pSparkMats[key]=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:1,blending:pBlend(type),depthWrite:false,depthTest:false}));
  const white=pSparkMats.w||(pSparkMats.w=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));
  for(let i=0;i<(num||PSPARK.N);i++){const a=Math.random()*6.283,b=Math.acos(2*Math.random()-1),v=PSPARK.V[0]+Math.random()*(PSPARK.V[1]-PSPARK.V[0]);
    const m=new THREE.Mesh(pSparkGeo,mat);m.renderOrder=30;m.position.copy(X);scene.add(m);
    const life=PSPARK.LIFE[0]+Math.random()*(PSPARK.LIFE[1]-PSPARK.LIFE[0]);
    pSparks.push({m,vx:Math.sin(b)*Math.cos(a)*v,vy:Math.cos(b)*v,vz:Math.sin(b)*Math.sin(a)*v,life,max:life,w:.7+Math.random()*1.1})}
}
function updatePSparks(dt){
  for(let i=pSparks.length-1;i>=0;i--){const p=pSparks[i];p.life-=dt;
    if(p.life<=0){scene.remove(p.m);pSparks.splice(i,1);continue}
    const k=Math.max(0,1-PSPARK.DRAG*dt);p.vx*=k;p.vy=p.vy*k-PSPARK.GRAV*dt;p.vz*=k;
    const m=p.m;m.position.x+=p.vx*dt;m.position.y+=p.vy*dt;m.position.z+=p.vz*dt;
    const sp=Math.hypot(p.vx,p.vy,p.vz)||1,u=p.life/p.max;
    m.lookAt(m.position.x+p.vx,m.position.y+p.vy,m.position.z+p.vz);   // 飛ぶ向きに細長く伸ばす
    m.scale.set(p.w*Math.min(1,u*2.5),p.w*Math.min(1,u*2.5),Math.max(.15,sp*.03*Math.min(1,u*2)));
  }
}
function getRingTex(){
  if(!ringTex){const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d');g.strokeStyle='#fff';g.lineWidth=10;g.shadowColor='#fff';g.shadowBlur=14;g.beginPath();g.arc(64,64,48,0,6.283);g.stroke();ringTex=new THREE.CanvasTexture(cv)}
  return ringTex;
}
const clashLights=[]; // 相殺地点を一瞬照らす実光源
function parryFx(X,type,en){                                       // type は魔法の種類、または['自分の魔法','相手の魔法']の配列（両方の光を重ねる）
  const types=[...new Set(Array.isArray(type)?type:[type])],n=types.length,cols=types.map(t=>PCOL[t]||0xffffff);
  for(let k=0;k<n;k++){const type=types[k],col=cols[k],sc=1-.2*k;   // 2つ目は少し小さくして、重ねても両方の色が見えるように
    enemyFlash(X,type,.8,true);   // 閃光も魔法の色（白でなく）
    // （相殺の実光源＝PointLight は、光源の数が変わるたびに描画が重くなるので出さない）
    parrySparks(X,type,Math.round(PSPARK.N*(n>1?.65:1)));   // 四方に飛び散る火花（魔法の色）
    {const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:pBlend(type),depthWrite:false,depthTest:false,side:THREE.DoubleSide}),
           m1=new THREE.Mesh(creaSphere,mk(col,.2)),m2=new THREE.Mesh(creaSphere,mk(col,.5)),rg=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),mk(col,.5));
     rg.rotation.x=-Math.PI/2;for(const m of [m1,m2,rg]){m.position.copy(X);m.renderOrder=30+k;scene.add(m)}
     creaBlasts.push({m1,m2,rg,t:0,R:1.6*sc})}   // 外へ広がる衝撃波の球殻と水平の輪
    getRingTex();
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,color:col,blending:pBlend(type),depthWrite:false,depthTest:false,transparent:true}));
    sp.renderOrder=30+k;sp.position.copy(X);sp.scale.setScalar(.6);scene.add(sp);eRings.push({s:sp,t:0,d:.25,R:4*sc});   // 衝撃波の輪（外へ大きく広がる）
    {const sp2=sp.clone();sp2.material=sp.material.clone();sp2.material.color.set(col);sp2.renderOrder=30+k;scene.add(sp2);eRings.push({s:sp2,t:0,d:.16,R:2.2*sc})}   // 内側の速い輪
  }
  shakeT=.25;shakeA=.09;                                            // 画面の揺れ
  const hx=c=>'#'+c.toString(16).padStart(6,'0');
  parryEl.style.background=n>1?'linear-gradient(90deg,'+hx(cols[0])+','+hx(cols[1])+')':hx(cols[0]);parryEl.style.transition='none';parryEl.style.opacity=.4;   // 画面の閃光（2色なら両方の色）
  requestAnimationFrame(()=>{parryEl.style.transition='opacity .25s';parryEl.style.opacity=0});
  if(en){const dx=en.x-player.x,dz=en.z-player.z,d=Math.hypot(dx,dz)||1;en.kx=dx/d;en.kz=dz/d;en.kv=Math.max(en.kv||0,7)}   // 敵はプレイヤーから離れる向きへよろめく
}
function castEnemyMagic(c){                                         // 杖を振り下ろした瞬間: 狙いの向きへ魔法を出す
  const O=c.golemO||wandTip(c),T=c.aim||{x:player.x,y:player.y-.7,z:player.z},A=new THREE.Vector3(T.x-O.x,T.y-O.y,T.z-O.z),dist=A.length()||1;A.divideScalar(dist);
  const type=c.spell||'fire',dmg=c.counter?0:EMAG.DMG[type]*enemyPower(c)*(c.dmgK===undefined?1:c.dmgK);if(type==='fire')castSnd('fireCastSample',.8,O.x,O.z);JFX.muzzle(O,A,gkPal(type),true);   // c.counter=プレイヤーの魔法を相殺するための魔法（当たってもダメージ・状態異常なし）
  if(type==='thunder'){                                             // 雷: 角ばったギザギザの閃光（プレイヤーの雷と同じ）が一瞬走る
    let L=Math.min(c.counter?1e9:BOLT.LEN,dist+3);for(let d=1;d<=L;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}
    const R=new THREE.Vector3().crossVectors(A,new THREE.Vector3(0,1,0));if(R.lengthSq()<1e-4)R.set(1,0,0);R.normalize();const U=new THREE.Vector3().crossVectors(R,A).normalize();
    const pts=[O.clone()];
    for(let i=1;i<=BOLT.SEG;i++){const t=i/BOLT.SEG,j=BOLT.JIT*(i===BOLT.SEG?.4:1)*(.4+Math.random()*.6);
      pts.push(O.clone().addScaledVector(A,L*t).addScaledVector(R,(Math.random()-.5)*2*j).addScaledVector(U,(Math.random()-.5)*2*j))}
    const mOut=new THREE.MeshBasicMaterial({color:0x7fa8ff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}),
          mCore=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
    const g=new THREE.Group();boltSegs(g,pts,.16,mOut);boltSegs(g,pts,.05,mCore);
    for(let b=0;b<3;b++){const k=2+Math.floor(Math.random()*(BOLT.SEG-5)),side=Math.random()<.5?1:-1,bp=[pts[k].clone()];
      for(let i=1;i<=4;i++)bp.push(bp[i-1].clone().addScaledVector(A,.9+Math.random()*.6).addScaledVector(R,side*(.5+Math.random()*1.1)).addScaledVector(U,(Math.random()-.5)*1.4));
      boltSegs(g,bp,.09,mOut);boltSegs(g,bp,.03,mCore)}
    const br={g,mOut,mCore,t:0,life:CLASH.BWAIT+.15};scene.add(g);bolts.push(br);   // 当たるまで光り続ける（その間に魔法をぶつければ消せる）                   // 消えるまではプレイヤーの雷と同じ updateLightning が進める
    fireBurst(pts[BOLT.SEG].x,pts[BOLT.SEG].y,pts[BOLT.SEG].z,10,4);JFX.impact(pts[BOLT.SEG].x,pts[BOLT.SEG].y,pts[BOLT.SEG].z,{cols:JFX.PAL.thunder,power:1.2,shards:12,dome:true,arcs:4,shake:false,ground:L<BOLT.LEN});
    eBolts.push({O:O.clone(),A:A.clone(),L,dmg,t:0,b:br,cancel:false,counter:!!c.counter,c});   // 当たるまで少し間をおく（その間に魔法をぶつければ消せる）
  }else if(type==='ice'){                                           // 氷: 狙った場所（プレイヤーの足元）に氷のかけらが集まり、すぐあとに弾けて凍らせる（動けばよけられる）
    const H=new THREE.Vector3(T.x,T.y,T.z),gy=supportAt(T.x,T.z,T.y);
    for(let i=0;i<18;i++){const a=i/18*6.283;addWaterPart(T.x+Math.cos(a)*EMAG.ICE_R,gy+.1,T.z+Math.sin(a)*EMAG.ICE_R,Math.cos(a)*-.8,2+Math.random()*1.5,Math.sin(a)*-.8,.5,.05+Math.random()*.04,6,iceMats)}
    eMagics.push({type,t:0,H,dmg,done:false,freeze:Math.min(ICE.MAX,ICE.CRE_TIME*enemyPower(c))});   // 弾かれた氷は凍らせない
  }else{                                                            // 火・水: 手元から正面へのびるビーム（プレイヤーの火・水と同じ）が一瞬出る
    const len=c.counter?Math.max(BEAM.LEN,dist+2):type==='fire'?BEAM.LEN:type==='blast'?BLAST.LEN:WBEAM.LEN,rad=type==='fire'?BEAM.RADIUS:type==='blast'?BLAST.RADIUS:WBEAM.RADIUS;let L=type==='blast'?len:Math.min(len,dist+2);   // ブラストは狙いの先も地面・壁まで走る（避けられてもその先で爆発する）
   
    let stopSolid=false;for(let d=1;d<=L;d+=.5){const sd=solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d);if(sd||(type==='water'&&O.y+A.y*d<WATER)){L=d;stopSolid=!!sd;break}}   // stopSolid=地面・壁に当たって止まった（ゴーレムのビームはそこで爆発）
    const M=emMat[type],g=new THREE.Group(),out=new THREE.Mesh(emGeo,M[0]),core=new THREE.Mesh(emGeo,M[1]);g.add(out);g.add(core);scene.add(g);
    eMagics.push({type,t:0,O,A,L,len,rad,g,out,core,dmg,k:enemyPower(c)*(c.dmgK===undefined?1:c.dmgK),hit:false,harmless:!!c.counter,inst:!!c.counter,c,fl:c.counter?L:0,hitAt:0,solid:stopSolid,boom:false,dur:Math.max(type==='blast'?BLAST.TIME:0,L/EMAG.BSPEED+.3)});   // ブラストは一瞬（プレイヤーのブラストと同じ長さ）だけ走る   // 先端が BSPEED で進み、届くまでが相殺のタイミング
  }
}
const EBLAST={R:4,KB:17,UP:7.5};   // ゴーレムのビームの爆発: R=見た目の大きさ(m) / KB=プレイヤーが吹き飛ぶ勢い(水平) / UP=上向きの勢い
function enemyBlastBoom(X,A,hitPlayer){                          // ビームが地面かプレイヤーに当たった所で爆発。プレイヤーに当たった時だけ、ビームの向きへ吹き飛ばす
  const m1=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xffe45a,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})),
        m2=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})),
        rg=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),new THREE.MeshBasicMaterial({color:0xfff6c8,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  rg.rotation.x=-Math.PI/2;
  for(const m of [m1,m2,rg]){m.position.set(X.x,m===rg?Math.max(X.y,supportAt(X.x,X.z,X.y+1))+.1:X.y,X.z);scene.add(m)}
  creaBlasts.push({m1,m2,rg,t:0,R:EBLAST.R});
  for(let i=0;i<46;i++)addFirePart(X.x,X.y,X.z,(Math.random()-.5)*14,Math.random()*9-1,(Math.random()-.5)*14,.35+Math.random()*.4,.06+.08*Math.random(),blastMats);
  creaDust(X.x,X.y-.2,X.z,22,7);fireBurst(X.x,X.y,X.z,14,8);
  shakeT=hitPlayer?.4:.25;shakeA=hitPlayer?.14:.08;
  if(hitPlayer&&!STAT.dead){let hx=A.x,hz=A.z,hd=Math.hypot(hx,hz);if(hd<1e-3){hx=Math.sin(player.yaw);hz=Math.cos(player.yaw);hd=1}
    player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=Math.max(player.kbv||0,EBLAST.KB);player.stunT=Math.max(player.stunT||0,HURT_KB.STUN);   // ビームの向きへ吹き飛ぶ
    if(!player.air){player.air=true;player.vy=EBLAST.UP}else player.vy=Math.max(player.vy,EBLAST.UP)}
}
function updateEnemyMagic(dt){
  for(let i=eMagics.length-1;i>=0;i--){
    const e=eMagics[i];e.t+=dt;
    if(e.type==='ice'){
      if(e.t>=EMAG.ICE_WARN){
        const H=e.H;JFX.impact(H.x,H.y,H.z,{cols:JFX.PAL.ice,power:1.3,shards:12,spikes:8,shake:false});
        for(let k=0;k<40;k++){const a=Math.random()*6.283,sp=1+Math.random()*3.5;addWaterPart(H.x+Math.cos(a)*.3,H.y,H.z+Math.sin(a)*.3,Math.cos(a)*sp,1.5+Math.random()*3.5,Math.sin(a)*sp,.5+Math.random()*.5,.05+Math.random()*.08,9,iceMats)}
        if(!e.harmless&&Math.hypot(player.x-H.x,player.z-H.z)<EMAG.ICE_R&&Math.abs((player.y-.7)-H.y)<3){if(playerManaPass()>0&&!shieldAbsorb(e.dmg||0)){if(e.dmg>0)playerMagic(e.dmg);if(!STAT.dead){STAT.frozenT=Math.min(ICE.MAX,Math.max(STAT.frozenT||0,e.freeze));iceEl.style.opacity=1;applyPlayerFrostbite();gkFirstTrait(e.c,'ice')}}}
        eMagics.splice(i,1);
      }
      continue;
    }
    if(e.t>e.dur){scene.remove(e.g);eMagics.splice(i,1);continue}
    const {A,O}=e,L=Math.max(.3,Math.min(e.L,e.inst?1e9:EMAG.BSPEED*e.t)),fire=e.type==='fire',grow=Math.min(1,e.t/.04),fade=Math.min(1,(e.dur-e.t)/.1);e.fl=L;const w=(1+Math.sin(e.t*(fire?60:70))*.1)*grow*fade,E=O.clone().addScaledVector(A,L),Mid=O.clone().addScaledVector(A,L/2);
    for(const [m,r] of [[e.out,e.rad*.8],[e.core,e.rad*.3]]){m.position.copy(Mid);m.lookAt(E);m.scale.set(r*w,r*w,L)}
    if(fire){
      for(let k=0;k<5;k++){const d=Math.random()*L,sp=.1+d*.03;addFirePart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,A.x*3,A.y*3+Math.random(),A.z*3,.25+Math.random()*.25,.1+Math.random()*.1)}
      for(let k=0;k<2;k++){const sp=12+Math.random()*6;addFirePart(O.x,O.y,O.z,A.x*sp+(Math.random()-.5)*1.2,A.y*sp+(Math.random()-.5)*1.2,A.z*sp+(Math.random()-.5)*1.2,.2+Math.random()*.15,.09+Math.random()*.08)}
      if(L<e.len)fireBurst(E.x,E.y,E.z,2,3);
    }else if(e.type==='blast'){
      for(let k=0;k<5;k++){const d=Math.random()*L;addFirePart(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d,(Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2,.15+Math.random()*.15,.05+Math.random()*.05,blastMats)}   // ビームの周りで空気が光る
      if(L<e.len)fireBurst(E.x,E.y,E.z,3,6);
    }else{
      for(let k=0;k<4;k++){const sp=14+Math.random()*8;addWaterPart(O.x,O.y,O.z,A.x*sp+(Math.random()-.5)*1.5,A.y*sp+(Math.random()-.5)*1.5,A.z*sp+(Math.random()-.5)*1.5,.25+Math.random()*.2,.05+Math.random()*.06,4,GKPM[e.type]&&GKPM[e.type]())}
      if(L<e.len)for(let k=0;k<3;k++){const a=Math.random()*6.283,sp=1+Math.random()*3;addWaterPart(E.x,E.y,E.z,Math.cos(a)*sp,2+Math.random()*3,Math.sin(a)*sp,.4+Math.random()*.3,.05+Math.random()*.06,undefined,GKPM[e.type]&&GKPM[e.type]())}
    }
    if(!e.fxd&&L>=e.L-.01&&e.L<e.len){e.fxd=1;JFX.impact(E.x,E.y,E.z,{cols:gkPal(e.type),power:1.1,shards:12,shake:false})}   // ビームが届いた所の着弾
    if(!e.rk&&L>=e.L-.01){e.rk=true;creaRockHit(O,A,e.L,e.rad*.6);
      if(e.type==='blast'&&!e.parried&&!e.boom&&!(!e.hit&&playerOnLine(O,A,L,e.rad+.45))){e.boom=true;enemyBlastBoom(O.clone().addScaledVector(A,Math.max(0,L-.3)),A,false)}}   // 先端が地面・壁に届いた → そこで爆発（同じ瞬間にプレイヤーへ当たるなら、下の当たりで爆発）
    if(!e.hit&&!e.harmless&&e.t>=e.hitAt&&playerOnLine(O,A,L,e.rad+.45)){e.hit=true;if(e.c&&e.c.mage&&swordDeflect(e.c)){e.parried=true;e.boom=true}else if(e.type==='water'){if(playerManaPass()>0&&!shieldAbsorb(0)){if(e.c&&e.c.gk&&e.c.gkFirst==='water')gkElemHit('water',e.c);else applyPlayerWet(e.c&&e.c.mana)}}else{playerMagic(e.dmg,e.O);if(!STAT.dead&&!SHIELD.blk&&e.type==='fire'&&playerManaPass()>0)applyPlayerBurn(e.k)}if(e.c&&e.c.gk&&!e.parried&&e.type!=='water')gkFirstTrait(e.c,e.type);if(e.type==='blast'&&!e.boom){e.boom=true;enemyBlastBoom(O.clone().addScaledVector(A,L),A,!SHIELD.blk)}}   // ブラストはプレイヤーに当たった所で爆発して、ビームの向きへ吹き飛ばす   // 先端がプレイヤーに届いたら当たる（1回だけ）
  }
}
// ---------- 創造の魔法（コントロールの先の△）: 狙った敵の足もとから、やや青い岩がせり上がって100ダメージ。岩は少しの間そこに残り、どんな魔法でも当たると青く爆発して、まわりに200ダメージ。魔力に関係なく通る（低マナにも効く）。敵がいない時は、狙った地面に岩だけ出る（爆発の仕掛けに使える） ----------
const CREA={RANGE:16,DMG:100,EXP_DMG:200,EXP_R:4.5,LIFE:12,RISE:.18,H:4.6,R:.62,MAX:8,KB_CRE:14,KB_UP:6,KB_PL:18,KB_PLUP:7,PL_LAUNCH:11,PL_DMG:25,PL_EXP_DMG:50};   // PL_DMG=自分の真下に出した時のダメージ / PL_EXP_DMG=爆風を受けた時のダメージ（プレイヤーの体力は100。体力バーが赤黒い時はさらに即死）
//   // RANGE=届く距離(m) / DMG=岩が出る時のダメージ / EXP_DMG,EXP_R=爆発のダメージと範囲(m) / LIFE=岩が残る秒数 / RISE=せり上がる秒数 / H,R=岩の高さと半径(m) / MAX=同時に立てられる岩の数
const creaRocks=[],creaBlasts=[];
const creaBlue=[0x3a9bff,0x8fd0ff,0xffffff].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));   // 爆発の青い火花
const creaShard=[0x5a7db0,0x3f5f8f,0x8fb2e0].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.95,depthWrite:false}));   // 岩のかけら
const creaDirt=[0x6b5a44,0x8a7656,0x4d4132].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.95,depthWrite:false}));   // せり上がる時の土煙
const creaSphere=new THREE.SphereGeometry(1,18,12);
function creaJitter(geo,seed){                                     // 面をごつごつさせる（同じ座標は同じ量だけずらすので割れない）
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+.2*Math.sin(x*12.9+y*7.3+z*5.1+seed)*Math.cos(x*4.1-y*9.7+z*8.3+seed*1.7);p.setXYZ(i,x*k,y*k,z*k)}
  geo.computeVertexNormals();return geo;
}
function makeCreaRock(s){                                          // 青い結晶: 高い一本の尖った結晶（六角柱の根元からまっすぐ細く尖る）。原点が足もと
  const g=new THREE.Group(),H=CREA.H*s,br=CREA.R*s*.75;              // br=根元の半径（当たり判定の円と同じ）
  const mats=[0x5aa0e8,0x7bbcf5].map(c=>new THREE.MeshLambertMaterial({color:mlvCol('d',c,0x0d3a9a),emissive:0x0e2f5c,flatShading:true}));
  const prof=[[0,0],[br,0],[br*1.04,H*.1],[br*.86,H*.42],[br*.42,H*.74],[0,H]].map(p=>new THREE.Vector2(p[0],p[1]));   // 根元が少し太く、先へ向かってすっと細くなる
  const body=new THREE.Mesh(new THREE.LatheGeometry(prof,6),mats[0]);body.position.y=-.05*s;g.add(body);   // 6面のカット（flatShadingで結晶らしく角ばる）
  const tip=new THREE.Mesh(new THREE.ConeGeometry(br*.5,H*.34,6),mats[1]);tip.position.y=H*.83;tip.rotation.y=Math.PI/6;tip.scale.set(1.04,1,1.04);g.add(tip);   // 先のほうだけ明るい色
  return g;
}
function makeCreaSpikes(s,ang){                                    // 創造の壁用: 外へ広がるトゲの束。高い1本（ほぼ直立）・斜めに外へ傾く1本・地面近くを外へのびる低い1本。原点が足もと・angは外向きの角度
  const g=new THREE.Group(),mats=[0x5aa0e8,0x7bbcf5].map(c=>new THREE.MeshLambertMaterial({color:mlvCol('d',c,0x0d3a9a),emissive:0x0e2f5c,flatShading:true}));
  const spec=[[.1,.4,2.4,3.2],[.6,1.0,1.8,2.8],[1.1,1.4,2.2,3.4]];   // [傾き最小,最大(rad・0=直立),長さ最小,最大(m)]
  for(const[t0,t1,l0,l1] of spec){
    const len=l0+Math.random()*(l1-l0),r=(.26+Math.random()*.16)*Math.sqrt(s),t=t0+Math.random()*(t1-t0),a=ang+(Math.random()-.5)*.5;
    const geo=new THREE.ConeGeometry(r,len,6);geo.translate(0,len/2,0);
    const m=new THREE.Mesh(geo,mats[Math.random()<.7?0:1]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(t)*Math.cos(a),Math.cos(t),Math.sin(t)*Math.sin(a)));
    m.position.set((Math.random()-.5)*.5,0,(Math.random()-.5)*.5);g.add(m);
  }
  return g;
}
function creaRemove(k){                                            // 岩を片づける
  scene.remove(k.g);k.g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
  const i=creaRocks.indexOf(k);if(i>=0)creaRocks.splice(i,1);k.dead=true;
}
function creaDust(x,y,z,n,sp){for(let i=0;i<n;i++){const a=Math.random()*6.283,v=sp*(.4+Math.random()*.6);addWaterPart(x+Math.cos(a)*.4,y+.05,z+Math.sin(a)*.4,Math.cos(a)*v,1.5+Math.random()*3,Math.sin(a)*v,.4+Math.random()*.4,.06+Math.random()*.07,9,Math.random()<.5?creaDirt:creaShard)}}
function spawnCreaRock(x,z,s,yr,opt){
  s*=1+.08*((MLVNOW.d||1)-1);   // レベルが上がるほど結晶が大きくなる（Lv1=そのまま → Lv10=約1.7倍。高さ・太さ・当たり判定・爆発の位置も一緒に大きくなる）
  opt=opt||{};
  if(!opt.wall)while(creaRocks.filter(r=>!r.wall).length>=CREA.MAX)creaRemove(creaRocks.find(r=>!r.wall));   // 壁の結晶は数に入れない
  const hm=opt.h?opt.h/(CREA.H*s):1;   // 壁の結晶: 高さを opt.h(m) にそろえる（太さ・当たり判定は普通の結晶と同じ）
  const y0=Math.max(yr===undefined?heightAt(x,z):supportAt(x,z,yr),WATER),g=opt.spike?makeCreaSpikes(s,Math.atan2(z-opt.cz,x-opt.cx)):makeCreaRock(s);if(!opt.spike)g.scale.y=hm;g.position.set(x,y0-CREA.H*s*hm,z);g.rotation.y=Math.random()*6.283;scene.add(g);   // はじめは地面の下
  creaRocks.push({g,x,z,y0,s,hm,wall:!!opt.wall,t:0,hit:!!opt.wall,fuse:-1,dead:false});
  if(!opt.wall)creaDust(x,y0,z,16,4);else creaDust(x,y0,z,4,3);
}
const CWALL={N:40,R:6.2,H:3.4};   // 創造の長押し: プレイヤーのまわりに、外へトゲが広がる結晶の壁（N=結晶の数 / R=壁の半径(m)。爆風がプレイヤーに届く距離 EXP_R×1.3=5.85m より外 / H=トゲの高さ(m)）。結晶の仕様（12秒・爆発・当たり判定）は普通の結晶と同じ
function creaWallStart(now){
  for(const k of creaRocks.filter(r=>r.wall))creaRemove(k);   // 前の壁は片づける
  const px=player.x,pz=player.z,yr=player.gy+.3;
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1;   // 壁の内側と、壁が立つ所にいる生き物は、外へ押し出す
    let dx=c.x-px,dz=c.z-pz,d=Math.hypot(dx,dz);
    if(d<CWALL.R+.6+.4*sz){if(d<1e-3){const a=Math.random()*6.283;dx=Math.cos(a);dz=Math.sin(a);d=1}
      const nd=CWALL.R+1.1+.4*sz;c.x=px+dx/d*nd;c.z=pz+dz/d*nd;c.kx=dx/d;c.kz=dz/d;c.kv=Math.max(c.kv||0,8)}}
  for(let i=0;i<CWALL.N;i++){const a=i/CWALL.N*6.283185;spawnCreaRock(px+Math.cos(a)*CWALL.R,pz+Math.sin(a)*CWALL.R,1,yr,{wall:true,spike:true,h:CWALL.H,cx:px,cz:pz})}
  FNOVA.next.d=now+fireNovaCD('d')*1000;
  if(typeof gameToast==='function')gameToast('結晶の壁');
  if(navigator.vibrate)navigator.vibrate(30);
  return true;
}
function creaSolids(){return window.__creaSolids||[]}               // 立っている結晶の当たり判定（円 [x,z,半径]）。updateCreation が毎フレーム更新
function creaLiftStep(c,dt){                                       // 結晶に突き上げられた生き物: 空中を飛んで落ちる（jy=地面からの高さ / jv=上向きの速さ）。着地後は結晶の外へ押し出す
  if(c.jv||c.jy>0){c.jv=(c.jv||0)-(c.jg||22)*dt;c.jy=Math.max(0,(c.jy||0)+c.jv*dt);if(c.jy<=0){c.jy=0;c.jv=0}}
  if(!(c.jy>0))for(const[qx,qz,qr] of creaSolids()){const ex=c.x-qx,ez=c.z-qz,d=Math.hypot(ex,ez),m=qr+.4*(c.size||1);if(d<m){if(d>1e-4){c.x+=ex/d*(m-d);c.z+=ez/d*(m-d)}else c.x+=m}}
}
let creaBeam=null;
function castCreation(){JFX.muzzleAuto('d');                                           // 青いビームを出して、その先（敵の足もと・地面）に結晶を立てる。ビームが立っている岩に当たったら、その岩が爆発（新しい岩は立たない）
  const cam=camera.position,{A,O}=beamFrame();
  let G=CREA.RANGE,gr=false;for(let d=1;d<=CREA.RANGE;d+=.5){if(solidAt(cam.x+A.x*d,cam.y+A.y*d,cam.z+A.z*d)){G=d;gr=true;break}}   // 地面にぶつかるまで
  let tg=null,T=G;
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-cam.x,c.y+sz*(c.hy||.95)-cam.y,c.z-cam.z),d=v.dot(A);   // 視線上で最初の生き物
    if(d>0&&d<T&&v.addScaledVector(A,-d).length()<HIT_R*sz+.3){T=d;tg=c}}
  const L=(tg||gr)?Math.max(1,T-.5):CREA.RANGE;
  if(!creaBeam){
    const geo=new THREE.CylinderGeometry(1,.35,1,10,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0x3a9bff,.5)),core=new THREE.Mesh(geo,mk(0xe0f3ff,.9));
    g.add(out);g.add(core);g.visible=false;scene.add(g);creaBeam={g,out,core};
  }
  const hitRock=creaRockHit(O,A,L,.2);                              // 先にビームが立っている岩に当たるか
  mTint('d',creaBeam.out.material,0x0a3cd0);mTint('d',creaBeam.core.material,0x6ab0ff,.1);
  creaBeam.t=0;creaBeam.L=L;creaBeam.cl=undefined;creaBeam.done=false;creaBeam.g.visible=true;
  creaBeam.spawn=hitRock?null:tg?{x:tg.x,z:tg.z,y:tg.y+(tg.jy||0),s:Math.min(1.5,Math.max(.8,tg.size||1))}:gr?{x:cam.x+A.x*G,z:cam.z+A.z*G,y:cam.y+A.y*G,s:1}:null;
  if(!hitRock&&!tg&&!gr&&typeof gameToast==='function')gameToast('届かない');
}
function explodeCreaRock(k){                                       // 青い爆発: まわりの生き物に200ダメージ（魔力に関係なく）。近くの岩も誘爆
  if(k.dead)return;
  const cx=k.x,cy=k.y0+CREA.H*.5*k.s*(k.hm||1),cz=k.z;creaRemove(k);JFX.impact(cx,k.y0+.1,cz,{cols:JFX.PAL.d,power:1.4,shards:18,dome:true,spikes:7});
  for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1;
    if(Math.hypot(c.x-cx,c.z-cz)<CREA.EXP_R+.4*sz&&Math.abs(c.y+sz*.5-cy)<CREA.EXP_R+sz){
      magicHit(c,CREA.EXP_DMG,cx,cz,{ignoreMana:true});
      let ex=c.x-cx,ez=c.z-cz,ed=Math.hypot(ex,ez);if(ed<1e-3){const a=Math.random()*6.283;ex=Math.cos(a);ez=Math.sin(a);ed=1}   // 爆発の中心から外へ吹き飛ばす
      c.kx=ex/ed;c.kz=ez/ed;c.kv=Math.max(c.kv||0,CREA.KB_CRE);c.jv=CREA.KB_UP;c.jy=.02}}   // 吹き飛び＋少し浮く
  {const px=player.x-cx,py=(player.y-.7)-cy,pz=player.z-cz,pd=Math.hypot(px,py,pz),lim=CREA.EXP_R*1.3;   // プレイヤーも爆風で吹き飛ぶ（ダメージはなし）
    if(pd<lim&&!STAT.dead){let hx=px,hz=pz,hd=Math.hypot(hx,hz);if(hd<1e-3){hx=Math.sin(player.yaw);hz=Math.cos(player.yaw);hd=1}   // 真下・真上なら向いている後ろへ
      const f=Math.max(.35,1-pd/lim);player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=CREA.KB_PL*f;playerMagic(CREA.PL_EXP_DMG,null,{ignoreMana:true});
      if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*f}else player.vy=Math.max(player.vy,CREA.KB_PLUP*f)}}
  for(const o of creaRocks){if(o.fuse<0&&Math.hypot(o.x-cx,o.z-cz)<CREA.EXP_R)o.fuse=.12}
  const m1=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0x3a9bff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})),
        m2=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xcfeaff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})),
        rg=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),new THREE.MeshBasicMaterial({color:0x8fd0ff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  rg.rotation.x=-Math.PI/2;
  for(const m of [m1,m2,rg]){m.position.set(cx,m===rg?k.y0+.1:cy,cz);scene.add(m)}
  creaBlasts.push({m1,m2,rg,t:0,cx,cy,cz});
  for(let i=0;i<46;i++)addFirePart(cx,cy,cz,(Math.random()-.5)*14,Math.random()*9-1,(Math.random()-.5)*14,.35+Math.random()*.4,.06+.08*Math.random(),creaBlue);   // 青い火花
  creaDust(cx,k.y0,cz,22,7);                                       // 岩のかけらが飛び散る
}
function creaRockHit(O,A,L,r){                                     // どんな魔法でも: 杖の先O・向きA・長さLの線（太さr）が岩に当たったら爆発
  let any=false;
  for(const k of creaRocks.slice()){
    if(k.dead||k.t<CREA.RISE*.6)continue;
    const rr=CREA.R*k.s*1.05;let ht=false;
    for(const f of [.12,.35,.58,.8]){const v=new THREE.Vector3(k.x-O.x,k.y0+CREA.H*f*k.s*(k.hm||1)-O.y,k.z-O.z),d=v.dot(A);   // 背が高いので、高さを変えて何か所かで当たりを見る
      if(d>-rr&&d<L+rr&&v.addScaledVector(A,-d).length()<rr+r){ht=true;break}}
    if(ht){explodeCreaRock(k);any=true}
  }
  return any;
}
function updateCreation(dt){
  if(creaBeam&&creaBeam.g.visible){                                 // 青いビーム（一瞬）。先に着いたら結晶が立つ
    const b=creaBeam;b.t+=dt;
    if(b.t>.25){b.g.visible=false}
    else{
      if(b.cl!==undefined&&b.cl<b.L-.01)b.spawn=null;   // 相殺されたら、その先の結晶は立たない
      const {A,O}=beamFrame(),L=b.cl===undefined?b.L:Math.max(.3,Math.min(b.L,b.cl)),E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);   // 相殺で縮んだ長さまで
      const grow=Math.min(1,b.t/.04),fade=Math.min(1,(.25-b.t)/.1),w=(1+Math.sin(b.t*60)*.12)*grow*fade;
      for(const [m,r] of [[b.out,.3],[b.core,.1]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
      for(let k=0;k<5;k++){const d=Math.random()*L,sp=.12+d*.02;addFirePart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,(Math.random()-.5)*1.5,(Math.random()-.5)*1.5,(Math.random()-.5)*1.5,.2+Math.random()*.2,.05+Math.random()*.05,creaBlue)}
      if(!b.done&&b.t>=.08){b.done=true;if(b.spawn)spawnCreaRock(b.spawn.x,b.spawn.z,b.spawn.s,b.spawn.y)}
    }
  }
  for(const k of creaRocks.slice()){
    if(k.dead)continue;k.t+=dt;
    if(k.fuse>=0){k.fuse-=dt;if(k.fuse<=0){explodeCreaRock(k);continue}}
    const H=CREA.H*k.s*(k.hm||1);
    if(k.t<CREA.RISE){const u=k.t/CREA.RISE;k.g.position.y=k.y0-H*(1-(1-(1-u)*(1-u)*(1-u)))}   // 勢いよくせり上がる（最後ゆっくり）
    else if(k.t<CREA.LIFE){k.g.position.y=k.y0}
    else if(k.t<CREA.LIFE+.6){k.g.position.y=k.y0-H*((k.t-CREA.LIFE)/.6)}   // 時間がたつと地面へ沈む
    else{creaRemove(k);continue}
    if(!k.hit&&k.t>=CREA.RISE*.5){k.hit=true;                       // 出てくる瞬間: 真上にいる生き物に100ダメージ（魔力に関係なく）
      for(const c of creatures){if(c.hp<=0)continue;const sz=c.size||1;
        if(Math.hypot(c.x-k.x,c.z-k.z)<CREA.R*k.s+.5*sz&&Math.abs(c.y-k.y0)<2.5){magicHit(c,CREA.DMG,k.x,k.z,{ignoreMana:true});c.jv=10;c.jy=.02}}   // 突き上げられて飛び上がる
      if(!STAT.dead&&Math.hypot(player.x-k.x,player.z-k.z)<CREA.R*k.s+PR&&player.gy<=k.y0+.8){player.air=true;player.vy=CREA.PL_LAUNCH;if(player.y<player.gy+1.7)player.y=player.gy+1.7;playerMagic(CREA.PL_DMG,null,{ignoreMana:true})}   // 自分の真下に出したら、突き上げられて飛び上がる（ダメージなし）
      creaDust(k.x,k.y0,k.z,14,5);
    }
  }
  for(let i=creaBlasts.length-1;i>=0;i--){                          // 爆発の光: 球がふくらんで消え、輪が地面に広がる
    const b=creaBlasts[i];b.t+=dt;const u=b.t/.32;
    if(u>=1){for(const m of [b.m1,b.m2,b.rg]){scene.remove(m);m.material.dispose()}b.rg.geometry.dispose();creaBlasts.splice(i,1);continue}
    const e=1-(1-u)*(1-u);const BR=b.R||CREA.EXP_R;b.m1.scale.setScalar(.3+BR*.9*e);b.m1.material.opacity=.55*(1-u);
    b.m2.scale.setScalar(.2+BR*.5*e);b.m2.material.opacity=.9*(1-u)*(1-u);
    b.rg.scale.setScalar(.5+BR*1.2*e);b.rg.material.opacity=.9*(1-u);
  }
  window.__creaSolids=creaRocks.filter(k=>!k.dead&&k.t>=CREA.RISE*.5&&k.t<CREA.LIFE).map(k=>[k.x,k.z,CREA.R*k.s*.75]);   // 立っている結晶は壁（沈み始めたら外す）
}
MAGIC.add({id:'d',name:'クリエイション',emoji:'🔷',cast:castCreation});
// ---------- 爆破の魔法（高エネルギーと操作の次）: 橙白のビームが最初に当たった人に「爆破の印」をつける。印のついた人は光りながら、3秒後に爆発して倒れ、まわりの生き物にもダメージ（魔力に関係なく通る）。動物には効かない ----------
const HCTRL={LEN:16,TIME:.3,RADIUS:.5,FUSE:3,EXP_R:3.5,EXP_DMG:150,PL_DMG:50};   // LEN=届く距離(m) / FUSE=爆発までの秒数 / EXP_R,EXP_DMG=爆発の範囲(m)とまわりへのダメージ（印をつけられた本人は倒れる）
const hcBombs=[],hcMats=[0xff4a3a,0xe01818,0x8a0a0a].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})),hcMatsW=[0xff4a3a,0xe01818,0x8a0a0a].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));   // hcMatsW=白を使わない爆破の火花（ゲートキーパー用）
let hcb=null;
function castHeCtrl(){JFX.muzzleAuto('e');
  if(!hcb){
    const geo=new THREE.CylinderGeometry(1,.35,1,10,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0xe01818,.5)),core=new THREE.Mesh(geo,mk(0xff6a50,.9));
    g.add(out);g.add(core);g.visible=false;scene.add(g);hcb={g,out,core,t:0,hit:false};
  }
  mTint('e',hcb.out.material,0x600000);mTint('e',hcb.core.material,0xff2a1a,.1);
  hcb.t=0;hcb.hit=false;hcb.parried=false;hcb.cl=undefined;hcb.g.visible=true;
}
function hcExplode(b){                                              // 爆発: 本人は倒れ、まわりの生き物にダメージ（魔力20以下の生き物には効かない）・外へ吹き飛ぶ。近くの結晶も誘爆
  const c=b.c,sz=c.size||1,x=c.x,y=c.y+sz*(c.hy||.95),z=c.z;
  scene.remove(b.m);b.m.material.dispose();
  for(const o of creatures){if(o===c||o.hp<=0||manaPassOf(o.mana||0)<=0)continue;const osz=o.size||1;
    if(Math.hypot(o.x-x,o.z-z)<HCTRL.EXP_R+.4*osz&&Math.abs(o.y+osz*.5-y)<HCTRL.EXP_R+osz){
      magicHit(o,HCTRL.EXP_DMG,x,z,{ignoreMana:true});
      let ex=o.x-x,ez=o.z-z,ed=Math.hypot(ex,ez)||1;o.kx=ex/ed;o.kz=ez/ed;o.kv=Math.max(o.kv||0,10)}}
  {const px=player.x-x,py=(player.y-.7)-y,pz=player.z-z,pd=Math.hypot(px,py,pz),lim=HCTRL.EXP_R*1.3;   // プレイヤーも爆風でダメージを受けて吹き飛ぶ
    if(pd<lim&&!STAT.dead&&playerManaPass()>0){let hx=px,hz=pz,hd=Math.hypot(hx,hz);if(hd<1e-3){hx=Math.sin(player.yaw);hz=Math.cos(player.yaw);hd=1}
      const f=Math.max(.35,1-pd/lim);player.kbx=hx/hd;player.kbz=hz/hd;player.kbv=CREA.KB_PL*f;playerMagic(HCTRL.PL_DMG,null,{ignoreMana:true});
      if(!player.air){player.air=true;player.vy=CREA.KB_PLUP*f}else player.vy=Math.max(player.vy,CREA.KB_PLUP*f)}}
  if(c.hp>0&&creatures.indexOf(c)>=0)harmCreature(c,c.hp+9999,x,z);
  for(const k of creaRocks)if(k.fuse<0&&Math.hypot(k.x-x,k.z-z)<HCTRL.EXP_R)k.fuse=.12;
  hcBoomFx(x,y,z,HCTRL.EXP_R);
}
function hcBoomFx(x,y,z,R,warm){try{JFX.impact(x,y,z,{cols:JFX.PAL.e,power:Math.max(1,R/3.5*1.3),shards:26,dome:true,ink:true,spikes:12})}catch(e){}   // warm=true: ゲートキーパーの爆破。白い芯・白い火花を使わず、爆破の色（橙）だけで描く                                         // 爆発の見た目: 球がふくらむ・輪が広がる・火花（Rは爆発の半径）
  const m1=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xe01818,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})),
        m2=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xff4a3a,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false})),
        rg=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  rg.rotation.x=-Math.PI/2;
  for(const m of [m1,m2,rg]){m.position.set(x,m===rg?Math.max(supportAt(x,z,y),WATER)+.1:y,z);scene.add(m)}
  creaBlasts.push({m1,m2,rg,t:0,R:R});
  for(let i=0;i<50;i++)addFirePart(x,y,z,(Math.random()-.5)*14,Math.random()*9-1,(Math.random()-.5)*14,.35+Math.random()*.4,.06+.08*Math.random(),hcMats);   // 赤熱した火花（トゲ）
  for(let i=0;i<20;i++)addFirePart(x,y,z,(Math.random()-.5)*10,Math.random()*7,(Math.random()-.5)*10,.3+Math.random()*.3,.05+.06*Math.random(),warm?hcMatsW:hcMats);
}
// 爆破の長押し＝自爆: 自分を中心に爆発して、まわりの生き物（敵も動物も）を巻き込む。プレイヤー自身は必ず死ぬ（光のシールドも無効）
const SELFB={R:HCTRL.EXP_R*1.6,DMG:HCTRL.EXP_DMG*2};   // R=自爆の範囲(m) / DMG=まわりへのダメージ（魔力20以下の生き物には効かない）
function selfDestructStart(now){
  if(STAT.dead)return false;
  const x=player.x,z=player.z,y=player.y-.7;
  for(const o of creatures){if(o.hp<=0||o.dead!==undefined||manaPassOf(o.mana||0)<=0)continue;const osz=o.size||1;
    if(Math.hypot(o.x-x,o.z-z)<SELFB.R+.4*osz&&Math.abs(o.y+osz*.5-y)<SELFB.R+osz){
      magicHit(o,SELFB.DMG,x,z,{ignoreMana:true});
      let ex=o.x-x,ez=o.z-z,ed=Math.hypot(ex,ez)||1;o.kx=ex/ed;o.kz=ez/ed;o.kv=Math.max(o.kv||0,12)}}
  for(const k of creaRocks)if(k.fuse<0&&Math.hypot(k.x-x,k.z-z)<SELFB.R)k.fuse=.12;   // 近くの結晶も誘爆
  hcBoomFx(x,y,z,SELFB.R);
  shakeT=.4;shakeA=.15;
  shieldOff(true);          // シールドは無効（自爆では防げない。クールタイムも入れない）
  killPlayer();             // 自分は必ず死ぬ
  if(typeof gameToast==='function')gameToast('自爆した');
  return true;
}
function updateHeCtrl(dt){
  if(hcb&&hcb.g.visible){
    hcb.t+=dt;if(hcb.t>HCTRL.TIME)hcb.g.visible=false;
    else{
      const {A,O}=beamFrame();let L=HCTRL.LEN,tgt=null;
      for(let d=1;d<=HCTRL.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}if(hcb.cl!==undefined)L=Math.min(L,hcb.cl);
      for(const c of creatures){if(c.hp<=0||c.dead!==undefined||isAnimal(c))continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);   // 最初に当たる人（動物は素通り）
        if(d>0&&d<L&&v.addScaledVector(A,-d).length()<HCTRL.RADIUS+.4*sz){L=d;tgt=c}}
      creaRockHit(O,A,L,HCTRL.RADIUS);                              // 結晶に当たれば結晶が爆発
      const grow=Math.min(1,hcb.t/.05),fade=Math.min(1,(HCTRL.TIME-hcb.t)/.12),w=(1+Math.sin(hcb.t*50)*.15)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
      for(const [m,r] of [[hcb.out,.3],[hcb.core,.11]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
      for(let k=0;k<5;k++){const d=Math.random()*L,sp=.15+d*.02;addFirePart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,(Math.random()-.5)*1.2,(Math.random()-.5)*1.2,(Math.random()-.5)*1.2,.2+Math.random()*.2,.05+Math.random()*.05,hcMats)}
      if(!hcb.hit&&tgt&&!hcb.parried&&manaPassOf(tgt.mana||0)<=0){hcb.hit=true;if(typeof gameToast==='function')gameToast('魔力が低くて印がつかない')}
      if(!hcb.hit&&tgt&&!hcb.parried){hcb.hit=true;if(!hcBombs.some(b=>b.c===tgt)){   // 1回の詠唱で1人だけ。すでに印がついていたら重ねない
        const m=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(m);
        hcBombs.push({c:tgt,t:0,m});if(typeof gameToast==='function')gameToast('爆破の印をつけた')}
        tgt.foe=null;setMood(tgt,canFight(tgt)?'hostile':'flee');   // 印をつけた時点で、プレイヤーに敵対する（戦えない人は逃げる）
        for(const o of creatures){                                   // 周りの人もプレイヤーに敵対（戦えない人・動物は逃げる）
          if(o===tgt||o.dead!==undefined||o.hp<=0||Math.hypot(o.x-tgt.x,o.z-tgt.z)>ALARM_R)continue;
          if(isAnimal(o)){setMood(o,'flee');continue}
          o.foe=null;setMood(o,isArmless(o)&&!isCaster(o)?'flee':'hostile');
        }}
    }
  }
  for(let i=hcBombs.length-1;i>=0;i--){                             // 印のついた人: 光が速く点滅して大きくなり、3秒後に爆発
    const b=hcBombs[i],c=b.c;b.t+=dt;
    if(c.hp<=0||c.dead!==undefined||creatures.indexOf(c)<0){scene.remove(b.m);b.m.material.dispose();hcBombs.splice(i,1);continue}   // 先に倒された/消えたら不発
    const sz=c.size||1,u=b.t/HCTRL.FUSE,fr=6+u*22;
    b.m.position.set(c.x,c.y+(c.jy||0)+sz*(c.hy||.95),c.z);b.m.scale.setScalar(sz*(.55+.5*u+.12*Math.sin(b.t*fr)));b.m.material.opacity=.25+.35*(.5+.5*Math.sin(b.t*fr))+.3*u;
    if(Math.random()<dt*30)addFirePart(c.x+(Math.random()-.5)*.6*sz,c.y+sz*(.3+Math.random()*1.3),c.z+(Math.random()-.5)*.6*sz,(Math.random()-.5)*1.5,1+Math.random()*2,(Math.random()-.5)*1.5,.3+Math.random()*.2,.05+.04*Math.random(),hcMats);
    if(b.t>=HCTRL.FUSE){hcBombs.splice(i,1);hcExplode(b)}
  }
}
MAGIC.add({id:'e',name:'爆破',emoji:'💣',cast:castHeCtrl});
// ---------- 支配の魔法（氷と操作の次）: 水色の線が最初に当たった人を宙に持ち上げる（魔力20以下の人には効かない。動物には効かない）。持ち上げた人は狙いの先に浮かんで手足をばたつかせる。もう一度振ると、狙った向きへ投げつける（近くの狙いは自動で補正）。投げられた人は人・動物に当たるとダメージを与え（自分も少し受ける）、地面・木・岩にぶつかると自分がダメージを受けて止まる。持ち上げて8秒たつと落ちる ----------
const LCTRL={LEN:16,TIME:.3,RADIUS:.5,HOLD:3.4,HOLD_MAX:8,SPEED:34,GRAV:12,LIFE:5,SPIN:6,HIT_DMG:90,SELF_DMG:30,LAND_DMG:45,AIM_R:2.6,AIM_LEN:40};   // HOLD=持ち上げた人を浮かべる距離(m) / HOLD_MAX=持てる秒数 / SPEED=投げる速さ(m/秒) / GRAV=投げた人にかかる重力 / SPIN=回転(rad/秒) / HIT_DMG=当たった相手へのダメージ / SELF_DMG=当たった時に投げられた本人が受けるダメージ / LAND_DMG=地面・木・岩にぶつかった時のダメージ(速いほど増える) / AIM_R=狙いの補正が効く範囲(m)
const lvMats=[0xffffff,0x9ff5e0,0x3de0c0].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
const lvDust=[0xb9a888,0x8d7d63].map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.8,depthWrite:false}));
let lvb=null,lvHeld=null;const lvFly=[],lvV=new THREE.Vector3(),lvP={x:0,z:0};
function lvAlive(c){return !!c&&c.hp>0&&c.dead===undefined&&creatures.indexOf(c)>=0}
function lvPlace(c,p,rx,rz){                                        // pは体の中心。体の中心まわりに傾けて、足元の位置を決める
  const sz=c.size||1,g=c.g;g.rotation.order='YXZ';g.rotation.set(rx,c.yaw-(c.golem?PEASANT_FLIP:0),rz);
  lvV.set(0,sz*.95,0).applyQuaternion(g.quaternion);
  g.position.set(p.x-lvV.x,p.y-lvV.y,p.z-lvV.z);c.x=p.x;c.z=p.z;
}
function lvEnd(c,vx,vy,vz){                                         // 持ち上げ・飛行を終える。あとは普通の落下(creaLiftStep)に任せる
  const L=c.lev;if(!L)return;c.lev=null;
  if(L.aura){scene.remove(L.aura);L.aura.material.dispose()}
  const alive=c.hp>0&&c.dead===undefined;
  c.g.rotation.x=0;c.g.rotation.z=0;if(alive)c.g.rotation.order='XYZ';
  const gy=supportAt(c.x,c.z,L.p.y-(c.size||1)*.95);c.y=gy;c.jy=Math.max(0,L.p.y-(c.size||1)*.95-gy);c.jv=vy||0;
  const h=Math.hypot(vx||0,vz||0);if(h>.1){c.kx=vx/h;c.kz=vz/h;c.kv=Math.min(7,h*.4)}
  if(alive){c.amp=0;c.posed=true;c.wait=0;if(!c.mood){c.foe=null;setMood(c,canFight(c)?'hostile':'flee')}}   // 暴れていた手足は次の更新で元に戻る。投げられた/落とされた人は怒って反撃（戦えない人は逃げる）
  if(lvHeld===c)lvHeld=null;
  const i=lvFly.indexOf(c);if(i>=0)lvFly.splice(i,1);
}
function lvGrab(c){
  if(lvHeld&&lvHeld!==c)lvEnd(lvHeld,0,0,0);                        // 持てるのは1人だけ
  const sz=c.size||1,aura=new THREE.Mesh(creaSphere,new THREE.MeshBasicMaterial({color:0x3de0c0,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(aura);
  c.lev={mode:'hold',t:0,p:new THREE.Vector3(c.x,c.y+(c.jy||0)+sz*(c.hy||.95),c.z),aura};
  c.jy=0;c.jv=0;c.kv=0;c.foe=null;
  lvHeld=c;alarmCreatures(c);                                       // 持ち上げられた人は殴られた時と同じように反応し、周りも反応する
  if(typeof gameToast==='function')gameToast('人を持ち上げた');
}
function lvAimDir(from,A,self){                                     // 投げる向き: 視線上に近い生き物がいれば、そちらへ（重力ぶん少し上へ）補正。いなければ視線のまま
  const O=camera.position;let best=null,bo=1e9;
  for(const o of creatures){if(o===self||o.hp<=0||o.dead!==undefined||o.lev)continue;
    const sz=o.size||1,v=lvV.set(o.x-O.x,o.y+(o.jy||0)+sz*(o.hy||.95)-O.y,o.z-O.z),d=v.dot(A);
    if(d<LCTRL.HOLD+1||d>LCTRL.AIM_LEN)continue;
    const off=v.addScaledVector(A,-d).length();
    if(off<LCTRL.AIM_R+.4*sz&&off<bo){bo=off;best=o}}
  if(!best)return A.clone();
  const sz=best.size||1,t=new THREE.Vector3(best.x-from.x,best.y+(best.jy||0)+sz*(best.hy||.95)-from.y,best.z-from.z),T=t.length()/LCTRL.SPEED;
  t.y+=.5*LCTRL.GRAV*T*T;return t.normalize();
}
function lvThrow(){
  const c=lvHeld,L=c.lev,{A}=beamFrame(),dir=lvAimDir(L.p,A,c);
  L.mode='fly';L.t=0;L.vx=dir.x*LCTRL.SPEED;L.vy=dir.y*LCTRL.SPEED;L.vz=dir.z*LCTRL.SPEED;L.hit=[];L.rx=0;
  c.yaw=pwYawTo(L.vx,L.vz);c.amp=1;c.posed=true;
  lvHeld=null;lvFly.push(c);
  for(let i=0;i<16;i++)addWaterPart(L.p.x,L.p.y,L.p.z,dir.x*8+(Math.random()-.5)*4,dir.y*8+(Math.random()-.5)*4,dir.z*8+(Math.random()-.5)*4,.35,.07+Math.random()*.05,0,lvMats);   // 投げた瞬間の光
}
function lvLand(c){                                                 // 地面・木・岩にぶつかった: 速いほど自分が痛い。そのあとは普通に立つ（倒れていたらそのまま）
  const L=c.lev,sz=c.size||1,x=L.p.x,z=L.p.z,gy=supportAt(x,z,L.p.y-sz*.95),sp=Math.hypot(L.vx,L.vy,L.vz);
  for(let i=0;i<18;i++){const a=Math.random()*6.283,r=1+Math.random()*3;addWaterPart(x+Math.cos(a)*.3,gy+.15,z+Math.sin(a)*.3,Math.cos(a)*r,1+Math.random()*2.5,Math.sin(a)*r,.5+Math.random()*.3,.08+Math.random()*.08,9,lvDust)}
  c.x=x;c.z=z;L.p.y=gy+sz*.95;
  const dmg=LCTRL.LAND_DMG*Math.min(1.5,sp/20);
  magicHit(c,dmg,x-L.vx*.05,z-L.vz*.05,{ignoreMana:true,noAlarm:true});
  lvEnd(c,0,0,0);
}
function lvBody(x,y,z,sz){const h=sz*.76;return solidAt(x,y+h,z)||solidAt(x,y,z)||solidAt(x,y-h,z)}   // 体（足元・胴・頭）のどこかが、浮島・石材などの立体の中か
function lvFlyStep(c,dt){
  const L=c.lev,sz=c.size||1;L.t+=dt;
  const n=Math.max(1,Math.ceil(dt*180)),h=dt/n;                       // 速いので細かく進める
  for(let s=0;s<n;s++){
    const px0=L.p.x,py0=L.p.y,pz0=L.p.z;L.vy-=LCTRL.GRAV*h;L.p.x+=L.vx*h;L.p.y+=L.vy*h;L.p.z+=L.vz*h;
    for(const o of creatures){                                       // 人・動物に当たったら、相手にダメージ・吹き飛ばし。自分もダメージを受けて減速
      if(o===c||o.hp<=0||o.dead!==undefined||o.lev||L.hit.indexOf(o)>=0)continue;
      if(Math.abs(o.x-L.p.x)>2.5||Math.abs(o.z-L.p.z)>2.5)continue;
      const osz=o.size||1,dx=o.x-L.p.x,dy=o.y+(o.jy||0)+osz*.95-L.p.y,dz=o.z-L.p.z;
      if(Math.hypot(dx,dy,dz)<.45*(sz+osz)+.25){
        L.hit.push(o);
        const sp=Math.hypot(L.vx,L.vz)||1,ux=L.vx/sp,uz=L.vz/sp;
        magicHit(o,LCTRL.HIT_DMG,o.x-ux,o.z-uz,{ignoreMana:true});                 // 飛んできた向きへ押される
        o.kx=ux;o.kz=uz;o.kv=Math.max(o.kv||0,12);
        if(o.hp>0&&o.dead===undefined){o.jv=7;o.jy=Math.max(o.jy||0,.02)}
        for(let i=0;i<14;i++)addFirePart(L.p.x,L.p.y,L.p.z,(Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*8,.3+Math.random()*.3,.06+Math.random()*.06,lvMats);
        magicHit(c,LCTRL.SELF_DMG,o.x,o.z,{ignoreMana:true,noAlarm:true});
        L.vx*=.4;L.vz*=.4;L.vy=Math.max(L.vy,3);
        if(c.hp<=0||c.dead!==undefined){lvEnd(c,L.vx,L.vy,L.vz);return}
      }
    }
    const gy=supportAt(L.p.x,L.p.z,L.p.y-sz*.95);
    let wall=false;
    if(L.p.y-gy<3.2){lvP.x=L.p.x;lvP.z=L.p.z;pwPush(lvP,.4*sz,L.p.y-sz*.95);wall=Math.hypot(lvP.x-L.p.x,lvP.z-L.p.z)>.02}   // 低く飛んでいる時は木・岩にもぶつかる
    const gt=Math.max(heightAt(L.p.x,L.p.z),WATER-.5);               // 地形だけの高さ
    if(wall||L.p.y-sz*.95<=gt||(L.p.y-sz*.95<=gy&&L.vy<=0)){lvLand(c);return}   // 地形にぶつかる / 浮島・建物の上へは、落ちてくる時だけ着地（上昇中に島の中へ入って「着地」しない）
    if(!lvBody(px0,py0,pz0,sz)&&lvBody(L.p.x,L.p.y,L.p.z,sz)){   // 浮島・石材などの立体に突っ込んだら、通り抜けずにぶつかる
      const nx=L.p.x,ny=L.p.y,nz=L.p.z;
      if(!lvBody(nx,py0,nz,sz)){                                    // 横は空いている→上面か下面にぶつかった
        let lo=py0,hi=ny;for(let k=0;k<8;k++){const m=(lo+hi)/2;if(lvBody(nx,m,nz,sz))hi=m;else lo=m}
        L.p.y=lo;
        if(L.vy<0){lvLand(c);return}                                // 上面に落ちた: 着地
        L.vy=-Math.abs(L.vy)*.2;                                    // 下面にぶつかった: 跳ね返って落ちる
      }else if(!lvBody(px0,ny,pz0,sz)){L.p.x=px0;L.p.z=pz0;L.vx*=-.2;L.vz*=-.2}   // 側面にぶつかった: 跳ね返る
      else{L.p.set(px0,py0,pz0);L.vx*=-.2;L.vz*=-.2;L.vy=0}
    }
  }
  if(L.t>LCTRL.LIFE){lvEnd(c,L.vx,L.vy,L.vz);return}
  L.rx+=LCTRL.SPIN*dt;c.phase+=dt*18;pwPose(c);                      // 手足を広げて回りながら飛ぶ
  c.yaw=pwYawTo(L.vx,L.vz);lvPlace(c,L.p,L.rx,0);
  if(L.aura){L.aura.position.copy(L.p);L.aura.scale.setScalar(sz*.8)}
  if(Math.random()<dt*50)addWaterPart(L.p.x+(Math.random()-.5)*.5,L.p.y+(Math.random()-.5)*.5,L.p.z+(Math.random()-.5)*.5,0,0,0,.35,.07+Math.random()*.05,0,lvMats);   // 光の尾
}
function lvHoldStep(c,dt){
  const L=c.lev,sz=c.size||1,{A}=beamFrame();L.t+=dt;
  if(L.t>LCTRL.HOLD_MAX){lvEnd(c,0,0,0);return}                     // 持てる時間が切れたら落ちる
  const d=LCTRL.HOLD+.4*sz,k=Math.min(1,dt*9);
  const ox=L.p.x,oy=L.p.y,oz=L.p.z;
  L.p.x+=(camera.position.x+A.x*d-L.p.x)*k;L.p.y+=(camera.position.y+A.y*d-L.p.y)*k;L.p.z+=(camera.position.z+A.z*d-L.p.z)*k;   // 視線の先へなめらかについてくる
  if(!lvBody(ox,oy,oz,sz)&&lvBody(L.p.x,L.p.y,L.p.z,sz)){          // 持ったまま浮島・石材に押し込まない（動ける向きにだけ動く）
    const nx=L.p.x,ny=L.p.y,nz=L.p.z;L.p.set(ox,oy,oz);
    if(!lvBody(nx,oy,oz,sz))L.p.x=nx;
    if(!lvBody(L.p.x,oy,nz,sz))L.p.z=nz;
    if(!lvBody(L.p.x,ny,L.p.z,sz))L.p.y=ny;
  }
  const gy=supportAt(L.p.x,L.p.z,L.p.y-sz*.95);if(L.p.y<gy+sz*.95+.15)L.p.y=gy+sz*.95+.15;   // 地面にめり込まない
  c.y=gy;c.yaw=pwYawTo(player.x-L.p.x,player.z-L.p.z);
  c.amp=1;c.phase+=dt*16;pwPose(c);c.posed=true;                     // 宙で手足をばたつかせる
  lvPlace(c,L.p,Math.sin(L.t*5)*.12,Math.sin(L.t*4.1)*.15);
  if(L.aura){L.aura.position.copy(L.p);L.aura.scale.setScalar(sz*(.85+.06*Math.sin(L.t*8)))}
  if(Math.random()<dt*24){const a=Math.random()*6.283;addWaterPart(L.p.x+Math.cos(a)*.6*sz,L.p.y-sz*.9,L.p.z+Math.sin(a)*.6*sz,0,1.2,0,.6,.06+Math.random()*.04,0,lvMats)}   // 足元から光が昇る
}
function castLevit(){JFX.muzzleAuto('b');
  if(lvAlive(lvHeld)){lvThrow();return}                              // もう持っている: 狙った向きへ投げつける
  lvHeld=null;
  if(!lvb){
    const geo=new THREE.CylinderGeometry(1,.35,1,10,1,true);geo.rotateX(Math.PI/2);
    const mk=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const g=new THREE.Group(),out=new THREE.Mesh(geo,mk(0x3de0c0,.5)),core=new THREE.Mesh(geo,mk(0xe6fff8,.85));
    g.add(out);g.add(core);g.visible=false;scene.add(g);lvb={g,out,core,t:0,hit:false};
  }
  mTint('b',lvb.out.material,0x0a8a78);mTint('b',lvb.core.material,0x3de0c0,.1);
  lvb.t=0;lvb.hit=false;lvb.g.visible=true;
}
function updateLevit(dt){
  if(lvb&&lvb.g.visible){
    lvb.t+=dt;
    if(lvb.t>LCTRL.TIME)lvb.g.visible=false;
    else{
      const {A,O}=beamFrame();let L=LCTRL.LEN,tgt=null;
      for(let d=1;d<=LCTRL.LEN;d+=.5){if(solidAt(O.x+A.x*d,O.y+A.y*d,O.z+A.z*d)){L=d;break}}if(lvb.cl!==undefined)L=Math.min(L,lvb.cl);
      for(const c of creatures){if(c.hp<=0||c.dead!==undefined||isAnimal(c)||c.lev)continue;const sz=c.size||1,v=new THREE.Vector3(c.x-O.x,c.y+(c.jy||0)+sz*(c.hy||.95)-O.y,c.z-O.z),d=v.dot(A);   // 最初に当たる人（動物は素通り）
        if(d>0&&d<L&&v.addScaledVector(A,-d).length()<LCTRL.RADIUS+.4*sz){L=d;tgt=c}}
      const grow=Math.min(1,lvb.t/.05),fade=Math.min(1,(LCTRL.TIME-lvb.t)/.12),w=(1+Math.sin(lvb.t*50)*.15)*grow*fade,E=O.clone().addScaledVector(A,L),M=O.clone().addScaledVector(A,L/2);
      for(const [m,r] of [[lvb.out,.3],[lvb.core,.11]]){m.position.copy(M);m.lookAt(E);m.scale.set(r*w,r*w,L)}
      for(let k=0;k<6;k++){const d=Math.random()*L,sp=.15+d*.02;
        addWaterPart(O.x+A.x*d+(Math.random()-.5)*sp,O.y+A.y*d+(Math.random()-.5)*sp,O.z+A.z*d+(Math.random()-.5)*sp,(Math.random()-.5)*.8,.3+Math.random()*.8,(Math.random()-.5)*.8,.3+Math.random()*.3,.06+Math.random()*.06,0,lvMats)}
      creaRockHit(O,A,L,LCTRL.RADIUS);
      if(!lvb.hit&&tgt){lvb.hit=true;if(manaPassOf(tgt.mana||0)>0)lvGrab(tgt);else if(typeof gameToast==='function')gameToast('魔力が低くて持ち上げられない')}                    // 1回の詠唱で1人だけ
    }
  }
  if(lvHeld&&!lvAlive(lvHeld)){const c=lvHeld;lvHeld=null;if(c.lev)lvEnd(c,0,0,0)}   // 持っている人が倒された・消えた
  if(lvHeld)lvHoldStep(lvHeld,dt);
  for(let i=lvFly.length-1;i>=0;i--){
    const c=lvFly[i];
    if(!c||!c.lev){lvFly.splice(i,1);continue}
    if(!lvAlive(c)){lvEnd(c,c.lev.vx||0,c.lev.vy||0,c.lev.vz||0);continue}
    lvFlyStep(c,dt);
  }
}
MAGIC.add({id:'c',name:'支配',emoji:'🫳',cast:(...a)=>castControl(...a)});   // 見た目・効果をコントロール（人を操る）と入れ替え中
// ---------- 魔法の相殺: 自分の魔法（火・水・雷・闇のビーム）と敵の魔法（火・水・雷のビーム／ゴーレムのビーム）がぶつかると、ぶつかった所で両方が止まる。敵の雷は、当たるまでに少し間(BWAIT)があり、その間にぶつけると消せる。氷は、自分の氷を敵の氷の発動場所の近くへ当てると消せる ----------
let iceClash=null;const eBolts=[],CLASH={R:.4,BWAIT:.45,BURST:.1};let clashT=0;   // R=ぶつかったと見なす余裕(m) / BWAIT=敵の雷が当たるまでの間(秒) / BURST=火花を出す間隔(秒)
const _cw=new THREE.Vector3(),_cp=new THREE.Vector3(),_cq=new THREE.Vector3();
function segClosest(P,u,Lu,Q,v,Lv){                                  // 2本の線分(始点P・向きu・長さLu / 始点Q・向きv・長さLv)の一番近い所。s=1本目での位置 t=2本目での位置 d=距離
  _cw.subVectors(P,Q);const b=u.dot(v),d=u.dot(_cw),e=v.dot(_cw),den=1-b*b;let s,t;
  if(den<1e-6){s=0;t=e}else{s=(b*e-d)/den;t=(e-b*d)/den}
  s=Math.max(0,Math.min(Lu,s));t=Math.max(0,Math.min(Lv,e+b*s));s=Math.max(0,Math.min(Lu,-d+b*t));
  _cp.copy(P).addScaledVector(u,s);_cq.copy(Q).addScaledVector(v,t);
  return{s,t,d:_cp.distanceTo(_cq),X:_cp.clone().add(_cq).multiplyScalar(.5)};
}
// ---------- 魔法人の相殺（MCOUNT / mageCounter） は mage.js に分離 ----------
function magicClashTick(dt){
  clashT-=dt;
  for(let i=clashLights.length-1;i>=0;i--){
    const q=clashLights[i];q.life-=dt;
    if(q.life<=0){scene.remove(q.light);clashLights.splice(i,1);continue}
    q.light.intensity=(q.i||9)*(q.life/q.max);
  }
  const mine=[],fr=beamFrame();
  if(flame&&flame.g.visible&&flame.t>.02)mine.push({O:fr.O,A:fr.A,L:flame.L||PBEAM.LEN,r:PBEAM.RADIUS,o:flame});
  if(wjet&&wjet.g.visible&&wjet.t>.02)mine.push({O:fr.O,A:fr.A,L:wjet.L||PWBEAM.LEN,r:PWBEAM.RADIUS,o:wjet});
  if(dkb&&dkb.g.visible&&dkb.t>.02)mine.push({O:fr.O,A:fr.A,L:dkb.L||DARK.LEN,r:DARK.RADIUS,o:dkb});
  if(blast&&blast.on&&blast.t<PBLAST.TIME)mine.push({O:fr.O,A:fr.A,L:blast.cl===undefined?PBLAST.LEN:blast.cl,r:PBLAST.RADIUS,o:blast});
  if(ctb&&ctb.g.visible&&ctb.t<CTRL.TIME)mine.push({O:fr.O,A:fr.A,L:ctb.cl===undefined?CTRL.LEN:ctb.cl,r:CTRL.RADIUS||.5,o:ctb});
  if(hcb&&hcb.g.visible&&hcb.t<HCTRL.TIME)mine.push({O:fr.O,A:fr.A,L:hcb.cl===undefined?HCTRL.LEN:hcb.cl,r:HCTRL.RADIUS,o:hcb});
  if(lvb&&lvb.g.visible&&lvb.t<LCTRL.TIME)mine.push({O:fr.O,A:fr.A,L:lvb.cl===undefined?LCTRL.LEN:lvb.cl,r:LCTRL.RADIUS,o:lvb});
  if(creaBeam&&creaBeam.g.visible&&creaBeam.t>.02)mine.push({O:fr.O,A:fr.A,L:creaBeam.cl===undefined?creaBeam.L:Math.min(creaBeam.L,creaBeam.cl),r:.3,o:creaBeam});
  if(iceClash){iceClash.t+=dt;if(iceClash.t<.12)mine.push({O:iceClash.O,A:iceClash.A,L:iceClash.L,r:.3,o:iceClash})}
  for(const b of bolts)if(b.mine&&b.t<.15)mine.push({O:b.O,A:b.A,L:b.L,r:PBOLT.RADIUS*.5,o:b});
  if(MGD.ON){for(let k=mine.length-1;k>=0;k--){const o=mine[k].o;if(!(o===dkb||o===ctb||o===hcb||o===lvb||o===creaBeam))mine.splice(k,1)}}   // 相殺できる自分の魔法は、闇・支配・操作・爆破・創造だけ（火・水・氷・雷・ブラストは弾けない）
  for(const M of mine){const o=M.o;if(!(o===flame||o===wjet||o===dkb||o===blast||o===ctb||o===hcb||o===lvb||o===creaBeam||o===iceClash||bolts.includes(o)))continue;if(o.cdLast===undefined||o.t<o.cdLast)mageCounter(M);o.cdLast=o.t}   // 自分の攻撃魔法が新しく出た瞬間に、魔法人が相殺を返す（t が戻った＝撃ち直し）
  if(mine.length){
    const foes=[];
    for(const e of eMagics)if(e.type!=='ice'&&e.t<e.dur&&!e.hit)foes.push({O:e.O,A:e.A,L:e.fl||.3,r:e.rad,e});
    for(const e of eMagics)if(e.type==='ice'&&!e.harmless)foes.push({O:new THREE.Vector3(e.H.x,e.H.y-.5,e.H.z),A:new THREE.Vector3(0,1,0),L:3,r:EMAG.ICE_R,e,iceF:true});   // 敵の氷の発動場所（足元の予兆）も、自分の魔法が通れば消える
    for(const q of eBolts)if(!q.cancel)foes.push({O:q.O,A:q.A,L:q.L,r:BOLT.RADIUS*.5,q});
    for(const F of foes)for(const M of mine){
      const c=segClosest(F.O,F.A,F.L,M.O,M.A,M.L);if(c.d>=F.r+M.r+CLASH.R)continue;
      const pt=M.o===creaBeam?'creation':M.o===iceClash?'ice':M.o===flame?'fire':M.o===wjet?'water':M.o===dkb?'dark':M.o===blast?'blast':M.o===ctb?'control':M.o===hcb?'hectrl':M.o===lvb?'levit':'thunder';   // 演出は、ぶつけたプレイヤー側の魔法の種類（色・火花）だけ。相手の魔法が何でも同じ
      const win=[pt,F.e?F.e.type:'thunder'];   // 相殺の光は、ぶつかった両方の魔法の色を重ねる（自分の魔法＋相手の魔法）
      if(F.iceF){const ix=eMagics.indexOf(F.e);if(ix>=0){eMagics.splice(ix,1);parryFx(c.X,[pt,'ice'],null)}continue}   // 敵の氷は消える（自分のビームはそのまま進む）
      if(F.e){if(!F.e.parried){F.e.parried=true;parryFx(c.X,win,F.e.harmless?null:F.e.c)}F.e.L=Math.max(.5,Math.min(F.e.L,c.s))}   // 敵の魔法が先に出ている → 自分の魔法がぶつかった所で弾く                   // 敵のビームはぶつかった所までに縮む（その先のこちらには届かない）
      else{F.q.cancel=true;F.q.b.t=Math.max(F.q.b.t,(F.q.b.life||BOLT.LIFE)*.75);parryFx(c.X,win,null)}    // 敵の雷は消える
      if(M.o!==undefined&&M.o!==null)M.o.parried=true;   // 弾かれた魔法（爆破の印などは付かない）
      if(M.o!==undefined&&M.o!==null)M.o.cl=Math.min(M.o.cl===undefined?1e9:M.o.cl,c.t);   // こちらのビームもぶつかった所までに縮む（次のフレームから）
      if(clashT<=0){clashT=CLASH.BURST;if(win.includes('fire'))fireBurst(c.X.x,c.X.y,c.X.z,8,4)}   // 炎の火の粉は、炎の魔法が相殺した時だけ（ほかの色に橙が混ざらないように）
    }
  }
  for(let i=eBolts.length-1;i>=0;i--){const q=eBolts[i];                // 敵の雷: 少し間をおいてから当たる
    if(q.cancel){eBolts.splice(i,1);continue}
    q.t+=dt;if(q.t>=CLASH.BWAIT){if(q.dmg>0&&playerOnLine(q.O,q.A,q.L,BOLT.RADIUS+.45)){if(!(q.c&&q.c.mage&&swordDeflect(q.c))){playerMagic(q.dmg,q.O);gkFirstTrait(q.c,'thunder')}}eBolts.splice(i,1)}}
}
function updateFire(dt){
  // 相殺判定を各魔法のダメージ判定より先に行い、同じフレーム内でも相殺地点より先へ届かないようにする
  magicClashTick(dt);
  updateWater(dt);
  updateLightning(dt);
  updateBeam(dt);updateFireNova(dt);JFX.update(dt);
  updateBlast(dt);shieldUpdate(dt);
  updateWaterBeam(dt);
  updateEnemyMagic(dt);
  gkSpearTick(dt);
  updateEnemyCharge(dt);
  updateDark(dt);
  updateControl(dt);
  updateCreation(dt);
  updateHeCtrl(dt);
  updateLevit(dt);
  updateTarget(dt);
  for(let i=fireballs.length-1;i>=0;i--){
    const f=fireballs[i];f.t+=dt;
    let tg=f.target;
    if(tg&&(tg.hp<=0||creatures.indexOf(tg)<0))tg=f.target=null;
    if(!tg){                                                         // 追いかける相手を探す: 前方でいちばん近い生きている人
      let bd=FIRE.RANGE;const sp0=Math.hypot(f.vx,f.vy,f.vz)||1;
      for(const c of creatures){
        if(c.hp<=0)continue;
        const ex=c.x-f.x,ey=c.y+(c.size||1)*.95-f.y,ez=c.z-f.z,d=Math.hypot(ex,ey,ez);
        if(d<bd&&(ex*f.vx+ey*f.vy+ez*f.vz)/(d*sp0+1e-6)>.2){bd=d;tg=c}
      }
      f.target=tg;
    }
    if(tg){                                                          // 相手の胸のほうへ、少しずつ向きを曲げる（速さは変えない）
      const ex=tg.x-f.x,ey=tg.y+(tg.size||1)*.95-f.y,ez=tg.z-f.z,d=Math.hypot(ex,ey,ez)||1,k=Math.min(1,dt*FIRE.TURN);
      f.vx+=(ex/d*FIRE.SPEED-f.vx)*k;f.vy+=(ey/d*FIRE.SPEED-f.vy)*k;f.vz+=(ez/d*FIRE.SPEED-f.vz)*k;
      const l=Math.hypot(f.vx,f.vy,f.vz)||1,m=FIRE.SPEED/l;f.vx*=m;f.vy*=m;f.vz*=m;
    }
    f.x+=f.vx*dt;f.y+=f.vy*dt;f.z+=f.vz*dt;f.g.position.set(f.x,f.y,f.z);
    const fl=1+Math.sin(f.t*40)*.15;f.core.scale.setScalar(.14*fl);f.outer.scale.setScalar(.26*(2-fl));   // ちらちら揺れる
    for(let k=0;k<2;k++)addFirePart(f.x,f.y,f.z,(Math.random()-.5)*.8-f.vx*.05,Math.random()*.6,(Math.random()-.5)*.8-f.vz*.05,.25+Math.random()*.2,.08+Math.random()*.06);   // 通ったあとに炎が残る
    let done=f.t>FIRE.LIFE||solidAt(f.x,f.y-.1,f.z);                // 時間切れ・地面に当たったら消える
    if(!done)for(const c of creatures){                              // 生き物（体の高さ約2m×size・太さ0.7m×size）に当たったらダメージ
      if(c.hp<=0)continue;const sz=c.size||1;
      if(Math.hypot(c.x-f.x,c.z-f.z)<.7*sz&&f.y>c.y-.2&&f.y<c.y+2*sz){magicHit(c,FIRE.DMG,f.x,f.z);if(c.hp>0)applyBurnToCreature(c);done=true;break}
    }
    if(done){fireBurst(f.x,f.y,f.z,18,5);scene.remove(f.g);fireballs.splice(i,1)}
  }
  for(let i=fireParts.length-1;i>=0;i--){
    const p=fireParts[i];p.life-=dt;
    if(p.life<=0){scene.remove(p.m);fireParts.splice(i,1);continue}
    if(p.flame){                                                     // 炎: 熱で昇る・空気抵抗で勢いが落ちる・ゆらゆら揺れる・色が変わる・ふくらんでから縮む
      const u=1-p.life/p.max,age=p.max-p.life,dr=1-Math.min(1,dt*FLAME.DRAG);
      p.vx=p.vx*dr+Math.sin(age*p.fr+p.ph)*FLAME.SWAY*dt;p.vz=p.vz*dr+Math.cos(age*p.fr*.9+p.ph)*FLAME.SWAY*dt;p.vy=p.vy*dr+(FLAME.BUOY[0]+FLAME.BUOY[1]*u)*dt;
      p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
      const st=Math.min(FLAME_ST.length-1,(Math.pow(u,.85)*FLAME_ST.length)|0);if(st!==p.st){p.st=st;p.m.material=FLAME_ST[st]}
      const gr=u<.18?u/.18:1,sc=p.size*FLAME.SZ*(.5+.5*gr)*Math.pow(1-u,.7)*(1+.22*Math.sin(age*p.fr*1.7+p.ph));
      p.m.scale.set(sc*.85,sc*1.2,1);continue;                       // 少し縦に長い（炎のしずくの形）
    }
    p.vy+=1.5*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;p.m.scale.setScalar(p.size*p.life/p.max);
  }
}
// ---------- 魔法のレベル: 魔法石を使って強化（上限10）。上げるほどダメージ・効果の大きさ(dmg)と、届く距離・太さ・範囲(rng)が広がる。プレイヤー専用の値だけを変える（敵の魔法は変わらない） ----------
const MLV={DMG:.15,RNG:.05,LEN:.1};   // 1レベルごとの増え方（Lv10でダメージ系×2.35・太さ/爆発範囲系×1.45・届く距離×1.9）
const MREACH=['LEN','RANGE','AIM_LEN','HOLD'];   // 「届く距離」にあたる値（これだけLENの増え方で伸びる）
const MSCALE={
  fire:{o:PBEAM,dmg:['DMG'],rng:['LEN','RADIUS']},
  water:{o:PWBEAM,rng:['LEN','RADIUS'],fn:(o,lv)=>{o.MANA=1+Math.floor((lv-1)/3)}},   // 水: 魔力を与える量は3レベルごとに+1
  thunder:{o:PBOLT,dmg:['DMG'],rng:['LEN','RADIUS']},
  ice:{o:PICE,dmg:['CRE_TIME','MAX'],rng:['RANGE','R']},
  dark:{o:DARK,dmg:['DMG'],rng:['LEN','RADIUS']},
  a:{o:PBLAST,dmg:['DMG'],rng:['LEN','RADIUS']},
  b:{o:LCTRL,dmg:['HIT_DMG','LAND_DMG','HOLD_MAX'],rng:['LEN','RADIUS','HOLD','AIM_R','AIM_LEN']},
  c:{o:CTRL,dmg:['DUR'],rng:['LEN','RADIUS']},
  d:{o:CREA,dmg:['DMG','EXP_DMG','MAX'],rng:['RANGE','EXP_R'],int:['MAX']},
  e:{o:HCTRL,dmg:['EXP_DMG'],rng:['LEN','RADIUS','EXP_R']}};
const MBASE={};
function magicLevelApply(id,lv){
  const t=MSCALE[id];if(!t)return;
  MLVNOW[id]=lv;
  if(id==='ice'){PICE.COL=new THREE.Color(0x8fd8ff).lerp(new THREE.Color(0x2a78e0),mlvT('ice'));PICE.BLUE=Math.min(.95,.7+.03*(lv-1))}   // 凍った生き物の青さもレベルで濃くなる（敵の氷のICEは変えない）
  const b=MBASE[id]||(MBASE[id]=Object.assign({},t.o)),dk=1+MLV.DMG*(lv-1),rk=1+MLV.RNG*(lv-1),lk=1+MLV.LEN*(lv-1);
  for(const k of t.dmg||[])t.o[k]=b[k]*dk;
  for(const k of t.rng||[])t.o[k]=b[k]*(MREACH.includes(k)?lk:rk);   // 届く距離は全部の魔法で同じ割合で伸びる
  for(const k of t.int||[])t.o[k]=Math.round(t.o[k]);
  if(t.fn)t.fn(t.o,lv);
}
MAGIC.bind(()=>STAT.stones,n=>{if(STAT.stones<n)return false;STAT.stones-=n;stoneBar.firstChild.textContent=STAT.stones;stoneBar.style.setProperty('--p',Math.min(1,STAT.stones/STONE_BAR_MAX));return true},magicLevelApply);
