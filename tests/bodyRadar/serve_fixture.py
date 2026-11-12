import os,sys,time,json,base64,tempfile
from unittest.mock import patch
from pathlib import Path
backend = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[3] / 'gcms_src/flask_backend'
if not (backend / 'tests/fixtures/vehicle.laz').is_file(): raise RuntimeError('Pass the local flask_backend path as the first argument')
os.chdir(backend);sys.path.insert(0, str(backend))
from flask import Flask,request,jsonify,Response
from flask_socketio import SocketIO
from app.services import temp_image_cache as cache
from app.services.radar_point_cloud import decode_body_radar_data
from app.services import geometry_capture as capture
import app.websocket.handler as handler
import config
import cv2,numpy as np
app=Flask(__name__);io=SocketIO(app,async_mode='threading',cors_allowed_origins='*')
handler.socketio=io
capture.ensure_capture_allowed=lambda generation=None: 0
capture.send_geomcap=lambda enabled: print('ISOLATED geomcap='+str(enabled),flush=True) or True
config.RADAR_POINT_CLOUD_URL='http://127.0.0.1:5194/fixture/geom/laz'
polls=0
@app.route('/fixture/geom/laz')
def fixture_laz():
 global polls
 polls+=1
 if polls<=3:return Response(b'',mimetype='application/octet-stream')
 return Response((backend/'tests/fixtures/vehicle.laz').read_bytes(),headers={'Capture-Finish':'true' if polls>=6 else 'false'},mimetype='application/octet-stream')
frames,geometry=decode_body_radar_data((backend / 'tests/fixtures/vehicle.laz').read_bytes())
image=np.full((500,1600,3),255,np.uint8)
image[:250,:800]=(30,80,160);image[250:,:800]=(80,160,30);image[:250,800:]=(180,30,60);image[250:,800:]=(40,160,180)
cv2.putText(image,'BODY ORIGINAL 1600 x 500',(200,270),cv2.FONT_HERSHEY_SIMPLEX,2,(255,255,255),4)
_,encoded=cv2.imencode('.png',image)
_,preview=cv2.imencode('.jpg',cv2.resize(image,(800,250)))
body=cache.put_preview_with_original(encoded.tobytes(),preview.tobytes(),original_mime='image/png')
xray_image=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
cv2.putText(xray_image,'XRAY FIXTURE',(300,400),cv2.FONT_HERSHEY_SIMPLEX,2,255,4)
_,xray_encoded=cv2.imencode('.png',xray_image)
xray=cache.put_and_url(xray_encoded.tobytes(),'image/png')
photo='data:image/png;base64,'+base64.b64encode(encoded.tobytes()).decode()
artifacts=Path(__file__).resolve().parents[1]/'layout/artifacts';artifacts.mkdir(exist_ok=True)
storage=tempfile.TemporaryDirectory(prefix='lvtong-crop-test-')
import app.services.image_store as image_store
image_store.IMAGE_STORAGE_ROOT=storage.name
from app.api.inspection import inspection_api
def save_submission(payload):
 paths=payload['evidences_image_path'].split('|')
 assert all(Path(path).is_file() for path in paths)
 report={'history_record':payload.get('history_record'),'evidenceCount':len(paths),'goodsCount':len(payload['goods_image_path'].split('|')),
         'evidenceSizes':[list(cv2.imread(path).shape[:2][::-1]) for path in paths],
         'allEvidenceSaved':True,'databaseWritten':False}
 (artifacts/'crop-submission.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print('SUBMISSION',json.dumps(report,ensure_ascii=True),flush=True)
 return 1
mock_repo=patch('app.api.inspection.DBVehicle').start().return_value
mock_repo.findRecentDuplicateId.return_value=None
mock_repo.addInspection.side_effect=save_submission
patch('app.db.user.DBUser').start().return_value.getUserByUsername.return_value={}
from app.extensions.auth import create_token
views={view:{'imageUrl':cache.put_and_url(frame.image,'image/png'),'metersPerPixel':.01,'coordinateAxes':frame.metadata['coordinateAxes']} for view,frame in frames.items()}
@app.route('/api/temp-images/crop',methods=['POST'])
def crop():
 try:
  b=request.json;url=cache.crop_from_preview_box(b['previewUrl'],b['x1'],b['y1'],b['x2'],b['y2']);return jsonify(code=0,data={'url':url})
 except ValueError as error:return jsonify(code=400,message=str(error)),400
@app.route('/api/temp-images/<tid>')
def image_get(tid):
 entry=cache.get(tid)
 return Response(entry.data,mimetype=entry.mime) if entry else ('missing',404)
@app.route('/api/device/body-radar-image',methods=['POST'])
def radar():
 result=capture.get_geometry_snapshot()
 return jsonify(code=0,data={**result,'imageUrl':result.get('views',{}).get('top',{}).get('imageUrl','')})
@app.route('/api/inspection/plate/<plate>')
def history(plate):return jsonify(code=0,data={'count':1,'driver_phone':'13800000000','vehicle_type':'16','vehicle_container_type':'3','vehicle_size':'12000|2500|3500'})
app.register_blueprint(inspection_api)
@app.route('/api/<path:path>',methods=['GET','POST'])
def fallback(path):
 data=[]
 if path=='device/gate-status':data={'connected':True,'stickdown':False,'gateOpen':False}
 if path=='device/status':data={'sensors':[]}
 if path=='device/plc-status':data={'fresh':True,'stickdown':False}
 if path=='auth/me':data={'phone':'13800000000','realName':'隔离测试','groupId':1}
 if path=='fixture/token':data={'token':create_token({'username':'layout-test','real_name':'隔离测试'})}
 if path=='dict/truck-types':data=[{'type_code':'16','type_name':'六型货车'}]
 if path=='dict/container-types':data=[{'type_code':'3','type_name':'厢式'}]
 if path.startswith('dict/stations/'):data={'station_name':'测试收费站'}
 if path=='user/query':data=[{'username':'layout-test','real_name':'隔离测试','phone':'13800000000'}]
 return jsonify(code=0,data=data)
@io.on('message')
def message(data):
 global polls
 if data['type']=='fixture_body_images':
  polls=0
  generation=capture.prepare_geometry_capture()
  io.emit('message',{'type':'booking_accepted','data':{'vehicleHeight':3,'carHeadLength':1.8,'vehicleType':'small','xrayEnabled':False}})
  io.emit('message',{'type':'image_ready','data':{'imageType':'body','urls':{'1':body}}})
  io.emit('message',{'type':'image_ready','data':{'imageType':'transparent','urls':{'1':xray,'2':xray,'3':xray}}})
  capture.start_geometry_capture(generation)
  capture.start_geometry_poll(generation)
 elif data['type']=='fixture_body_reset':
  capture.stop_geometry_capture()
  io.emit('message',{'type':'booking_reset','data':{}})
 elif data['type']=='fixture_expire':
  with cache._LOCK:
   for entry in cache._CACHE.values():entry.created_at-=3*60*60
  print('ISOLATED expired cache; browser keeps the displayed image',flush=True)
 elif data['type']=='fixture_capture_seed':
  io.emit('message',{'type':'mobile_upload','data':{'phone':'13800000000','goods_type':'10101','head_image_path':photo,'tail_image_path':photo,'license_image_path1':photo,'passcode_image_path':photo,'goods_image_path':photo,'evidences_image_path':photo+'|'+photo}})
  io.emit('message',{'type':'mobile_passcode','data':{'valid':True,'vehicleId':'鄂A12345_1','vehicleDisplayId':'鄂A12345','vehicleColorName':'1','enStationId':'entry','exStationId':'exit','enWeight':'20000','exWeight':'20000','mediaTypeId':2,'transactionId':'fixture-transaction','passId':'fixture-pass','exTime':'2026-11-10 12:00:00','transPayTypeId':1,'fee':'100','payFee':'100','vehicleSignId':2,'provinceCount':'1'}})
io.run(app,host='127.0.0.1',port=5194,allow_unsafe_werkzeug=True)

