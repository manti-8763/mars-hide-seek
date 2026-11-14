// Appearance only; underlying elevation and imagery remain unchanged.
let material=null;
const button=document.getElementById('appearance-toggle');
let colored=true;
try{colored=localStorage.getItem('mars-terrain-color')!=='gray'}catch{}
function apply(){document.documentElement.classList.toggle('mars-color',colored);if(material)material.color.setHex(colored?0xd7a47c:0xffffff);button.textContent=colored?'흑백 지형으로 보기':'화성색 지형으로 보기';button.setAttribute('aria-pressed',String(colored));}
button.addEventListener('click',()=>{colored=!colored;try{localStorage.setItem('mars-terrain-color',colored?'mars':'gray')}catch{}apply()});
export function bindTerrainMaterial(value){material=value;apply()}
apply();
