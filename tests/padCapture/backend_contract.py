"""独立校验真实 Flask 移动上传端点及通行码解析，不启动现场后端或设备服务。

用法：后端的 python.exe tests/padCapture/backend_contract.py <flask_backend> <样例JSON>
"""
import ast
import importlib.util
import io
import json
import sys
import tempfile
from pathlib import Path
from typing import Any

from flask import Flask

backend = Path(sys.argv[1]).resolve(strict=True)
sample = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))

# mobile.py 不依赖应用初始化，可直接挂载实际 Blueprint 到隔离的 Flask 实例。
spec = importlib.util.spec_from_file_location('mobile_contract', backend / 'app/api/mobile.py')
mobile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mobile)
app = Flask(__name__)
app.register_blueprint(mobile.mobile_api)
with tempfile.TemporaryDirectory(prefix='pad-mobile-contract-') as temporary:
    mobile.UPLOAD_BASE_PATH = Path(temporary)
    response = app.test_client().post('/api/mobile/upload/json', data={
        'file': (io.BytesIO(json.dumps(sample, ensure_ascii=False).encode('utf-8')), 'photo_test.json'),
    })
    assert response.status_code == 200 and response.json['code'] == 0, response.data
    saved = json.loads((Path(temporary) / 'photo_test.json').read_text(encoding='utf-8'))
    assert saved == sample

# 仅执行 watcher 的纯解析函数，避免导入模块时连接数据库、目录监听和硬件。
source = ast.parse((backend / 'app/services/mobile_watcher.py').read_text(encoding='utf-8'))
parser = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == '_parse_passcode')
namespace = {'Any': Any}
exec(compile(ast.Module(body=[parser], type_ignores=[]), 'mobile_watcher._parse_passcode', 'exec'), namespace)
info = namespace['_parse_passcode'](saved['passcodeQRCodeInfo'])
assert info['valid'] and info['vehicleDisplayId'] == '豫A9237L'
assert info['vehicleColorName'] == '1' and info['exWeight'] == '16440'
assert info['enWeight'] == '16800' and info['vehicleSignId'] == 255
assert info['fee'] == '125100' and info['provinceCount'] == '3'
print('PASS: actual Flask multipart upload, UTF-8 storage and backend passcode parser')
