import os,sys,time,json
from pathlib import Path
backend = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[3] / 'gcms_src/flask_backend'
if not (backend / 'samples/vehicle.laz').is_file(): raise RuntimeError('Pass the local flask_backend path as the first argument')
os.chdir(backend);sys.path.insert(0, str(backend))
from flask import Flask,request,jsonify,Response
from flask_socketio import SocketIO
from app.services import temp_image_cache as cache
from app.services.radar_point_cloud import decode_body_radar_data
from app.services.body_radar_projection import SAMPLE_PATH
import cv2,numpy as np
app=Flask(__name__);io=SocketIO(app,async_mode='threading',cors_allowed_origins='*')
frames,geometry=decode_body_radar_data(SAMPLE_PATH.read_bytes())
image=np.full((500,1600,3),255,np.uint8)
image[:250,:800]=(30,80,160);image[250:,:800]=(80,160,30);image[:250,800:]=(180,30,60);image[250:,800:]=(40,160,180)
cv2.putText(image,'BODY ORIGINAL 1600 x 500',(200,270),cv2.FONT_HERSHEY_SIMPLEX,2,(255,255,255),4)
_,encoded=cv2.imencode('.png',image);body=cache.put_and_url(encoded.tobytes(),'image/png')
views={view:{'imageUrl':cache.put_and_url(frame.image,'image/png'),'metersPerPixel':.01,'coordinateAxes':frame.metadata['coordinateAxes']} for view,frame in frames.items()}
@app.route('/api/temp-images/crop',methods=['POST'])
def crop():
 b=request.json;url=cache.crop_from_preview_box(b['previewUrl'],b['x1'],b['y1'],b['x2'],b['y2']);return jsonify(code=0,data={'url':url})
@app.route('/api/temp-images/<tid>')
def image_get(tid):
 entry=cache.get(tid)
 return Response(entry.data,mimetype=entry.mime) if entry else ('missing',404)
@app.route('/api/device/body-radar-image',methods=['POST'])
def radar():return jsonify(code=0,data={'geometry':geometry,'views':views,'imageUrl':views['top']['imageUrl'],'source':'sample','sourceLabel':'示范数据'})
@app.route('/api/<path:path>',methods=['GET','POST'])
def fallback(path):
 data=[]
 if path=='device/gate-status':data={'connected':True,'stickdown':False,'gateOpen':False}
 if path=='device/status':data={'sensors':[]}
 if path=='device/plc-status':data={'fresh':True,'stickdown':False}
 return jsonify(code=0,data=data)
@io.on('message')
def message(data):
 if data['type']=='fixture_body_images':
  io.emit('message',{'type':'booking_accepted','data':{'vehicleHeight':3,'carHeadLength':1.8,'vehicleType':'small','xrayEnabled':False}})
  io.emit('message',{'type':'image_ready','data':{'imageType':'body','urls':{'1':body}}})
io.run(app,host='127.0.0.1',port=5194,allow_unsafe_werkzeug=True)

