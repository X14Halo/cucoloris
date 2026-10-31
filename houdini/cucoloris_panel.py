"""Cucoloris Lab inside Houdini: a Python Panel that shows the same page as the web version.

STARTING POINT. Written against the host contract (docs/HOUDINI.md) and the shim that tests/host_shim_mock.py
exercises, but NOT yet run inside Houdini. Lines marked CHECK name Houdini nodes or parameters to confirm on
your version; lines marked PIPELINE are where your studio's conventions go.

Install:
  1. Build the page:  python3 build.py   (gives dist/cucoloris-lab.html)
  2. Put this folder on HOUDINI_PATH's python path (e.g. $HOUDINI_USER_PREF_DIR/python3.11libs/) and
     cucoloris.pypanel in $HOUDINI_USER_PREF_DIR/python_panels/.
  3. Set CUCOLORIS_PAGE to the built page, or leave it next to this file's ../dist/.
  4. If WebGL2 is missing in the panel, add to houdini.env:  QTWEBENGINE_CHROMIUM_FLAGS="--ignore-gpu-blocklist"
"""
import base64
import json
import os
import re
import traceback

import hou

try:                                    # Houdini with Qt 6
    from PySide6 import QtCore, QtWidgets
    from PySide6.QtWebChannel import QWebChannel
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEngineScript, QWebEngineSettings
except ImportError:                     # Houdini with Qt 5 (PySide2)
    from PySide2 import QtCore, QtWidgets
    from PySide2.QtWebChannel import QWebChannel
    from PySide2.QtWebEngineWidgets import QWebEngineView, QWebEngineScript, QWebEngineSettings

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.environ.get('CUCOLORIS_PAGE', os.path.join(HERE, '..', 'dist', 'cucoloris-lab.html'))

# PIPELINE: where gobos are written. {seq} {shot} {mode} {name} are filled by the tool.
EXPORT_TEMPLATE = os.environ.get('CUCOLORIS_EXPORT', '$JOB/shots/{seq}/{shot}/lighting/gobos/{name}')
# PIPELINE: the LOP whose stage holds the shot camera, and the camera prim.
CAMERA_LOP = '/stage/CAMERA_SOURCE'          # e.g. the shot's layout/camera import node
CAMERA_PRIM = '/cameras/shotCam'


def _ok(value=None):
    return json.dumps({'value': value})


def _err(e):
    traceback.print_exc()
    return json.dumps({'error': str(e)})


class Bridge(QtCore.QObject):
    """Every slot takes strings and returns JSON {"value": ...} or {"error": "..."} (see cucoloris_host.js)."""

    @QtCore.Slot(result=str)
    def config(self):
        return _ok({'label': 'Houdini', 'exportTemplate': hou.text.expandString(EXPORT_TEMPLATE), 'followTimeline': False})

    # ---------- shots ----------
    @QtCore.Slot(result=str)
    def shots(self):
        """PIPELINE: the shots a lighter can pick, [{id, seq, shot, label, first, last}]."""
        try:
            # Example: the current hip's shot only, from environment variables your pipeline sets.
            seq, shot = os.environ.get('SEQ', 'seq'), os.environ.get('SHOT', 'shot')
            first, last = int(hou.playbar.frameRange()[0]), int(hou.playbar.frameRange()[1])
            return _ok([{'id': f'{seq}/{shot}', 'seq': seq, 'shot': shot, 'label': f'{seq} / {shot}', 'first': first, 'last': last}])
        except Exception as e:
            return _err(e)

    @QtCore.Slot(str, result=str)
    def shotPasses(self, shot_id):
        """PIPELINE: the shot's utility EXRs.
        {units: metres per scene unit, upZ: bool, layers: {pos, nrm, col}, frames: {"1001": [paths], ...}}
        P and N must be world space, in the camera's space and units; compression none/RLE/ZIPS/ZIP."""
        try:
            seq, shot = shot_id.split('/')
            pattern = hou.text.expandString(f'$JOB/shots/{seq}/{shot}/render/utility/utility.*.exr')   # PIPELINE
            frames = {}
            import glob
            for path in sorted(glob.glob(pattern)):
                m = re.search(r'\.(\d+)\.exr$', path)
                if m:
                    frames.setdefault(str(int(m.group(1))), []).append(path)
            stage = hou.node(CAMERA_LOP).stage()
            from pxr import UsdGeom
            return _ok({'units': UsdGeom.GetStageMetersPerUnit(stage), 'upZ': UsdGeom.GetStageUpAxis(stage) == 'Z',
                        'layers': {'pos': 'P', 'nrm': 'N', 'col': 'albedo'},                          # PIPELINE: AOV names
                        'frames': frames})
        except Exception as e:
            return _err(e)

    @QtCore.Slot(str, str, result=str)
    def shotCamera(self, shot_id, frame):
        """The shot camera at a frame: its local-to-world matrix (row vectors, looking down -Z) and vertical FOV."""
        try:
            from pxr import Usd, UsdGeom, Gf
            stage = hou.node(CAMERA_LOP).stage()
            cam = UsdGeom.Camera(stage.GetPrimAtPath(CAMERA_PRIM)).GetCamera(Usd.TimeCode(float(frame)))
            m = cam.transform
            return _ok({'matrix': [[m[i][j] for j in range(4)] for i in range(4)],
                        'vfov': cam.GetFieldOfView(Gf.Camera.FOVVertical)})
        except Exception as e:
            return _err(e)

    # ---------- files ----------
    @QtCore.Slot(str, result=str)
    def readFile(self, path):
        try:
            with open(path, 'rb') as f:
                return _ok(base64.b64encode(f.read()).decode())
        except Exception as e:
            return _err(e)

    @QtCore.Slot(str, str, result=str)
    def writeFile(self, path, b64):
        """Large sequences: consider a local HTTP endpoint instead of base64 over the channel (docs, Known limits)."""
        try:
            path = hou.text.expandString(path)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(base64.b64decode(b64))
            return _ok(path)
        except Exception as e:
            return _err(e)

    # ---------- the light ----------
    @QtCore.Slot(str, result=str)
    def sendLight(self, payload):
        try:
            p = json.loads(payload)
            return _ok(send_light(p['rig'], p['files']))
        except Exception as e:
            return _err(e)

    @QtCore.Slot(str, result=str)
    def setFrame(self, frame):
        try:
            hou.setFrame(float(frame))
            return _ok(True)
        except Exception as e:
            return _err(e)


def send_light(rig, files):
    """Bring the light rig into the shot and attach the gobo. Idempotent: one node per shot and pattern."""
    shot = rig.get('shot') or {}
    name = re.sub(r'\W+', '_', f"cucoloris_{shot.get('shot', 'set')}_{rig['mode']}")
    net = hou.node('/stage')
    node = net.node(name)
    if node is None:
        node = net.createNode('sublayer', name)          # CHECK: node type name of the Sublayer LOP
        node.moveToGoodPosition()
        # PIPELINE: wire it into the shot's lighting network, e.g. into a named merge LOP
    node.parm('filepath1').set(files['usd'])             # CHECK: the file parameter name (multiparm, first entry)
    try:
        node.parm('reload').pressButton()                # CHECK: reload so a re-export shows at once
    except Exception:
        pass
    attach_gobo(node, rig, files)
    return node.path()


def attach_gobo(sublayer_node, rig, files):
    """RENDERER-SPECIFIC: turn the rig's cucoloris:gobo:* description into your renderer's projected-texture filter.

    The light prim is /cucoloris/gobo_light in the layer. Drive the filter from (docs/HOUDINI.md, "How the gobo is projected"):
      rig['gobo']['pattern']      texture path with $F4 (sequences), rig['gobo']['colorSpace']
      rig['gobo']['projection']   {'kind': 'perspective', 'fov', 'tiling'} or {'kind': 'orthographic', 'width', 'center'}
      rig['gobo']['wrap']         repeat / black / white / repeat-u
      rig['gobo']['blur']         fraction of the image width
    Image +X is the light's +X, image up is the light's +Y. Keep this idempotent: update an existing filter.
    """
    print('Cucoloris Lab: light rig referenced; attach_gobo() is not written yet for this renderer.')


def create_widget():
    """Called by cucoloris.pypanel's onCreateInterface()."""
    view = QWebEngineView()
    page = view.page()
    s = page.settings()
    s.setAttribute(QWebEngineSettings.WebGLEnabled, True)
    s.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
    s.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, False)

    # Qt's own qwebchannel.js, then the host shim, both before the page's script
    qwc = QtCore.QFile(':/qtwebchannel/qwebchannel.js')
    qwc.open(QtCore.QIODevice.ReadOnly)
    src = bytes(qwc.readAll()).decode()
    with open(os.path.join(HERE, 'cucoloris_host.js')) as f:
        src += '\n' + f.read()
    script = QWebEngineScript()
    script.setName('cucoloris_host')
    script.setSourceCode(src)
    script.setInjectionPoint(QWebEngineScript.DocumentCreation)
    script.setWorldId(QWebEngineScript.MainWorld)
    script.setRunsOnSubFrames(False)
    page.scripts().insert(script)

    channel = QWebChannel(page)
    bridge = Bridge(view)
    channel.registerObject('cucoloris', bridge)
    page.setWebChannel(channel)
    view._cucoloris = (channel, bridge)                  # keep them alive with the widget

    view.load(QtCore.QUrl.fromLocalFile(os.path.abspath(PAGE)))
    return view
