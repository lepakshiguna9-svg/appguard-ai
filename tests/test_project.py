import json, subprocess, sys
from pathlib import Path
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app.main import app
from app.model import Preprocessor


def test_artifacts_and_health():
    with TestClient(app) as client:
        health=client.get('/api/v1/health').json()
        assert health['status']=='healthy' and health['model_loaded']
        info=client.get('/api/v1/model-info').json()
        assert info['calibration']['sample_size']==500
        assert info['human_review_required'] is True

def test_preprocessor_missing_and_unknown_categories():
    row={'policy_type':'auto','requested_coverage':10000,'deductible':500,'payment_frequency':'monthly','channel':'web','submission_velocity_24h':1,'recent_change_count':0}
    pre=Preprocessor().fit([row])
    changed={**row,'policy_type':'unseen','requested_coverage':None,'channel':None}
    encoded=pre.encode([changed])
    assert encoded.shape==(1,pre.dim)
    assert __import__('numpy').isfinite(encoded).all()

def test_demo_scoring_and_bounds():
    with TestClient(app) as client:
        records=client.get('/api/v1/demo/samples').json()['records']
        assert len(records)>=20
        keys=['policy_type','requested_coverage','deductible','payment_frequency','channel','submission_velocity_24h','recent_change_count']
        result=client.post('/api/v1/score/batch',json={'applications':[{k:r[k] for k in keys} for r in records[:3]]})
        assert result.status_code==200
        for row in result.json()['results']:
            assert row['anomaly_score']>=0 and row['review_recommended']==(row['anomaly_score']>row['threshold'])
        assert client.post('/api/v1/score/batch',json={'applications':[{}]*101}).status_code==422

def test_invalid_input_and_unknown_categories():
    with TestClient(app) as client:
        r=client.post('/api/v1/score',json={'policy_type':'mystery','requested_coverage':10000,'deductible':500,'payment_frequency':'weekly','channel':'new_channel','submission_velocity_24h':0,'recent_change_count':0})
        assert r.status_code==200 and r.json()['anomaly_score']>=0
        bad=client.post('/api/v1/score',json={'policy_type':'auto','requested_coverage':-1,'deductible':1,'payment_frequency':'annual','channel':'web','submission_velocity_24h':0,'recent_change_count':0})
        assert bad.status_code==422

def test_frontend_build():
    if not (ROOT/'frontend/node_modules').exists(): return
    r=subprocess.run(['npm','run','build'],cwd=ROOT/'frontend',capture_output=True,text=True)
    assert r.returncode==0,r.stdout+'\n'+r.stderr
