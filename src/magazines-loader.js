let loading;
export async function mountMagazineCenterLazy(root,context){
 const scope=[context.user()?.id,context.user()?.role,context.warehouse()].join(':');
 if(root.magazineScope===scope&&root.magazineController){root.magazineController.render();return;}
 root.magazineController?.stop();root.magazineController=null;root.magazineScope=scope;root.textContent='Carregando Central de Revistas…';
 loading ||= import('./magazines-view.js').catch(error=>{loading=null;throw error;});const module=await loading;
 if(root.magazineScope!==scope||!context.isCurrent())return;root.magazineController=module.mountMagazineCenter(root,context);
}
