#!/bin/sh
# Herdr generates gpui-kit.d.ts from its component registry at startup, so CI has no
# way to obtain it. This prints loose stand-ins instead: the elements stay untyped,
# while types/herdr.d.ts -- the API surface Mods actually misuse -- stays checked.
# A machine with the App runs scripts/sync-host-types.sh and gets the real ones.
cat <<'TYPES'
declare module "gpui-kit" {
  export type Color = string;
  export const View: any;
  export const div: (...args: any[]) => any;
  export const svg: (...args: any[]) => any;
  export const image: (...args: any[]) => any;
  export const PathBuilder: any;
  export const Background: any;
}
// gpui-shell's window, not the browser's. Loose on purpose: it keeps a stray shell
// call from being the one error CI reports while everything else is stubbed.
interface Window { [key: string]: any }
declare module "gpui-base" {
  export const h_flex: (...args: any[]) => any;
  export const v_flex: (...args: any[]) => any;
  export const TextView: any;
  export const TextareaState: any;
  export const Textarea: any;
  export const Scrollbar: any;
  export const Editor: any;
  export const EditorState: any;
}
TYPES
