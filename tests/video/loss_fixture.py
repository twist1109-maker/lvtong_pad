"""本机合成H.265→生产H.264转码；仅丢本夹具UDP视频包，不影响系统网络。"""
import sys,os,time,json,threading,socket,subprocess,re
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
import yaml
backend=Path(sys.argv[1]).resolve();sys.path.insert(0,str(backend))
from app.services.video_transcode import build_transcode_config,ffmpeg_path
artifacts=Path(__file__).resolve().parents[1]/'layout/artifacts/video-loss';artifacts.mkdir(parents=True,exist_ok=True)
base={'logLevel':'warn','api':True,'apiAddress':'127.0.0.1:19997','rtsp':True,'rtspAddress':'127.0.0.1:18554',
      'rtmp':False,'hls':False,'srt':False,'moq':False,'webrtc':True,'webrtcAddress':'127.0.0.1:18889',
      'webrtcLocalUDPAddress':'127.0.0.1:18189','webrtcLocalTCPAddress':'127.0.0.1:18189',
      'webrtcIPsFromInterfaces':False,'webrtcAdditionalHosts':['127.0.0.1'],'udpMaxPayloadSize':1180,
      'paths':{f'cam{i}':{'source':'rtsp://127.0.0.1:18554/synthetic','rtspTransport':'tcp'} for i in range(1,7)}}
ffmpeg=ffmpeg_path();config=build_transcode_config(base,ffmpeg,'libx264',width=640,fps=15)
config['paths']['synthetic']={'source':'publisher'}
cfg=artifacts/'mediamtx.yml';cfg.write_text(yaml.safe_dump(config),encoding='utf8')
stats={'rtpPackets':0,'dropped':0};peers={}
relay=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);relay.bind(('127.0.0.1',18190));relay.settimeout(.5)
def upstream(peer,client):
 while True:
  try:data=peer.recv(65535)
  except OSError:return
  if len(data)>2 and 128<=data[0]<=191 and data[1]<192:
   stats['rtpPackets']+=1
   if stats['rtpPackets']%35==0:
    stats['dropped']+=1
    continue
  try:relay.sendto(data,client)
  except OSError:return
def forward():
 while True:
  try:data,client=relay.recvfrom(65535)
  except socket.timeout:continue
  except OSError:return
  if client not in peers:
   peer=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);peer.connect(('127.0.0.1',18189));peers[client]=peer
   threading.Thread(target=upstream,args=(peer,client),daemon=True).start()
  peers[client].send(data)
threading.Thread(target=forward,daemon=True).start()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/fixture/stats':
   self.send_response(200);self.end_headers();self.wfile.write(json.dumps(stats).encode());return
  self.send_error(404)
 def proxy(self):
  length=int(self.headers.get('Content-Length',0));body=self.rfile.read(length) if length else None
  headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length','connection')}
  request=Request('http://127.0.0.1:18889'+self.path,data=body,headers=headers,method=self.command)
  try:
   with urlopen(request,timeout=25) as response:
    data=response.read()
    if response.headers.get('Content-Type','').startswith('application/sdp'):
     data=re.sub(rb'(a=candidate:[^\r\n]+ udp [^\r\n]+) 18189 ',rb'\1 18190 ',data,flags=re.I)
    self.send_response(response.status)
    for key,value in response.headers.items():
     if key.lower() not in ('content-length','transfer-encoding','connection'):self.send_header(key,value)
    self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  except Exception as e:self.send_error(502,str(e))
 do_POST=proxy
 do_DELETE=proxy
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',18890),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
children=[];logs=[]
try:
 log=(artifacts/'mediamtx.log').open('w');logs.append(log)
 children.append(subprocess.Popen([str(backend/'tools/mediamtx/mediamtx.exe'),str(cfg)],cwd=artifacts,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW))
 time.sleep(1)
 log=(artifacts/'hevc-source.log').open('w');logs.append(log)
 children.append(subprocess.Popen([ffmpeg,'-hide_banner','-loglevel','warning','-nostdin','-re','-f','lavfi','-i','testsrc2=size=640x360:rate=15','-an','-c:v','libx265','-preset','ultrafast','-x265-params','pools=2:frame-threads=2:keyint=15','-f','rtsp','-rtsp_transport','tcp','rtsp://127.0.0.1:18554/synthetic'],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW))
 print('Isolated UDP loss fixture ready: HTTP18890, UDP relay18190, TCP18189',flush=True)
 while True:
  if any(p.poll() is not None for p in children):raise RuntimeError('Fixture child stopped; inspect logs')
  (artifacts/'relay-stats.json').write_text(json.dumps(stats),encoding='utf8');time.sleep(1)
except KeyboardInterrupt:pass
finally:
 server.shutdown();relay.close()
 for peer in peers.values():peer.close()
 for child in reversed(children):
  if child.poll() is None:child.terminate()
 for child in children:
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill()
 for log in logs:log.close()
