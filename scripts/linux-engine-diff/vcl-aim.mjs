// Where LibreOffice's text really is, read by the harness itself (#171 M4, T16). LibreOffice on its gtk3 plugin reports
// the AT-SPI extents of what VCL draws from its frame's own idea of where VCL's widget is, which a ConfigureNotify (the
// harness's raise) sets to the client's origin and the next pointer event to the widget's true origin: until then every
// VCL extent is too high by the native menu bar's height (27 px on the #171 VM). The GTK panel that hosts VCL's root pane
// reports its true rectangle throughout, so the harness measures VCL's offset as the host's origin less the root pane's.
// This is the harness's own reading of the host panel, never the engine's correction (engine `vcl.rs`), so that a proof
// aimed by it shows the engine's points independently.

/** Whether a scene's application is LibreOffice on its gtk3 plugin, whose VCL extents need the host's offset. */
export const LIBREOFFICE_FAMILIES = ['writer', 'calc', 'impress'];

/**
 * The shift that moves VCL's extents to where VCL draws, from the client panel, the host panel and the root pane, each
 * `{x, y, w, h}`: `{dx, dy}`, zero when the host and the root pane agree. Anything but the menu bar's offset (the root
 * pane at the client's origin with the host's size, the host lower) throws, so a harness aim never rests on a guess.
 */
export function vclShiftOf({ client, host, root }) {
  if (root.x === host.x && root.y === host.y && root.w === host.w && root.h === host.h) return { dx: 0, dy: 0 };
  const known = root.w === host.w && root.h === host.h && root.x === host.x && root.x === client.x && root.y === client.y && host.y > root.y;
  if (!known) throw new Error(`LibreOffice's VCL offset has an unknown shape: client ${JSON.stringify(client)}, host ${JSON.stringify(host)}, root pane ${JSON.stringify(root)}`);
  return { dx: host.x - root.x, dy: host.y - root.y };
}

/**
 * The shift for a LibreOffice window, read from its AT-SPI frame: the frame's panel whose panel child holds the root
 * pane (Writer, Calc and Impress alike, task 72's hierarchy sitting).
 */
export function vclShift(oracle, frame) {
  for (const client of oracle.children(frame)) {
    if (oracle.role(client) !== 'panel') continue;
    for (const host of oracle.children(client)) {
      if (oracle.role(host) !== 'panel') continue;
      const root = oracle.children(host).find((id) => oracle.role(id) === 'root pane');
      if (root) return vclShiftOf({ client: oracle.extents(client), host: oracle.extents(host), root: oracle.extents(root) });
    }
  }
  throw new Error("LibreOffice's frame has no panel hosting a root pane: VCL's offset cannot be read");
}
