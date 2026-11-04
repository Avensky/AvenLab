import {forwardRef,type ComponentPropsWithoutRef} from 'react';

type MenuTabButtonProps=Omit<ComponentPropsWithoutRef<'button'>,'type'|'role'|'aria-selected'>&{selected:boolean};

/** Shared native tab surface. Each menu retains its own selection, roving
 * focus and controller routing; focusing a tab never commits by default. */
export const MenuTabButton=forwardRef<HTMLButtonElement,MenuTabButtonProps>(function MenuTabButton({selected,className='',children,...props},ref){
 return <button {...props} ref={ref} type="button" role="tab" aria-selected={selected} className={`menu-control ${className}`}>{children}</button>;
});
