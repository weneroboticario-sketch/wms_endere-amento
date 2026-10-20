import "../style.css";
import "../src/cpalamo-theme.css";
import {initializeCpAppearance} from "../src/cpalamo-appearance.js";

const html=await(await fetch("/index.html")).text();
const documentSource=new DOMParser().parseFromString(html,"text/html");
document.body.append(documentSource.querySelector(".app-shell"));
document.body.classList.add("auth-unlocked");
initializeCpAppearance();
document.querySelectorAll(".cpalamo-only").forEach(n=>n.hidden=false);
document.getElementById("transferPreviewGroups").innerHTML='<article class="transfer-preview-group"><div><strong>T D COSMETICOS LTDA → D E T COSMETICOS LTDA ME (12933)</strong><span>1 item | 3 un.</span><span>Origem: COD VF 23696 - T D COSMETICOS LTDA</span><span>Destino: COD VF 12933 - D E T COSMETICOS LTDA ME</span></div><div class="transfer-preview-group-actions"><select aria-label="Responsável do grupo"><option>Selecionar responsável</option></select><button class="secondary-button" type="button">Cancelar grupo</button></div></article>';
document.getElementById("transferPreviewSummary").innerHTML=["Transferências","Itens","Quantidade total","Erros"].map((label,i)=>`<div class="summary-chip"><span>${label}</span><strong>${[1,1,3,0][i]}</strong></div>`).join("");
document.getElementById("transferPreviewRows").innerHTML='<tr><td>80887</td><td>UOMINI DES BDY SPR 100ml V7 PCK</td><td>3 UN</td><td><div class="transfer-stock-snapshot"><span>Saldo loja <strong>0</strong></span><span>Saldo captação <strong>0</strong></span><span>Retirar captação <strong>0</strong></span><span>Faltante <strong>3</strong></span></div></td><td>Sem saldo CAPTAÇÃO</td><td>R03-RK05-L02-G</td><td>Saldo insuficiente</td></tr>';
window.layoutFixture={
  ready:true,
  show(id,section){
    document.querySelectorAll(".screen").forEach(node=>{node.hidden=node.id!==id;node.classList.toggle("active",node.id===id);});
    if(section)document.querySelectorAll("#transferencias>.transfer-section").forEach(node=>node.hidden=node.id!==section);
    window.scrollTo(0,0);
  }
};
