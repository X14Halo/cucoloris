/* =====================================================================
   HOST
   Everything the tool needs from the world outside the page goes
   through this one object. The web version below uses placeholder shots
   and browser downloads. A production host (a Houdini Python panel, say)
   defines window.CUCOLORIS_HOST before this script runs; whatever it
   provides replaces the web version, function by function, and
   whatever it leaves out keeps working as on the web.
   docs/HOUDINI.md describes every member and what a TD has to write.
   ===================================================================== */
const WEB_HOST = {
  name:'web',
  label:'Web',
  /* The shots the Shot menu lists (an array, or a promise of one). Each:
     {id, seq, shot, label, first, last,
      mode?, preset?, lights?, anchors?   – optional starting set-up for the shot
      placeholder?                        – true only for the mockup's made-up shots} */
  shots:() => SHOTS,
  /* The utility passes of one shot, as a source:
     {units, upZ, read(frame, step) → {pos, nrm?, col?, a?, matte?}, camera?(frame) → camera}
     units: metres per scene unit (0 = guess from the passes); upZ: true for a Z-up scene.
     Each pass is {W, H, data:[Float32Array per channel]}, rows top to bottom, in scene units and axes.
     read() may skip pixels: step 2 means half resolution.
     camera(frame), when there is one, replaces the camera solved from the position pass:
     {eye:[x,y,z], at:[x,y,z] or forward:[x,y,z], up:[x,y,z], vfov: vertical field of view in degrees}
     (or {matrix: the camera's 4×4 world transform, row-major, USD/Houdini row-vector convention, vfov}) */
  openShot:def => placeholderSource(def),
  /* Write one exported file. null on the web: the export dialog packs files into downloads (or a folder
     the viewer picks). A host returns the absolute path it wrote, so the light rig can point at it. */
  writeFile:null,
  /* The folder an export of this shot goes to, shown in the dialog and written into the light rig.
     ctx: {shot (the shot entry or null), mode, name}. '' on the web: files sit next to each other. */
  exportDir:ctx => '',
  /* Build or update the light in the 3D app from an exported rig: rig is the object lightRig() returns,
     files the paths writeFile returned ({gobo:[…], usd, settings}). null on the web: the rig travels in the export. */
  sendLight:null,
  /* The tool's timeline moved to this frame number (for a host that wants its own timeline to follow). */
  frameChanged:null,
};
const HOST = Object.assign({}, WEB_HOST, (typeof window !== 'undefined' && window.CUCOLORIS_HOST) || {});
const hostIsWeb = () => HOST.name === 'web';
