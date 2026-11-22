import json, subprocess, sys
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app.main import app
from app.config import CALIBRATION_PATH, CATEGORICAL, FEATURES, METADATA_PATH, NUMERIC
from app.model import Preprocessor, VAE, read_csv, review_recommended, score_rows


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

def test_calibration_and_runtime_use_the_same_feature_schema_preprocessor_and_score():
    metadata=json.loads(METADATA_PATH.read_text())
    assert metadata['feature_schema']==FEATURES
    assert metadata['encoded_feature_order']==CATEGORICAL+NUMERIC
    pre=Preprocessor.from_dict(metadata['preprocessor'])
    assert pre.dim==metadata['input_dim']
    model=VAE(metadata['input_dim'],tuple(metadata['hidden_sizes']),metadata['latent_size'])
    checkpoint=__import__('torch').load(ROOT/'artifacts'/metadata['artifact'],map_location='cpu',weights_only=True)
    model.load_state_dict(checkpoint['state_dict']); model.eval()
    calibration=read_csv(CALIBRATION_PATH)
    scores=[row[0] for row in score_rows(model,pre,calibration)]
    calibrated=float(np.quantile(scores,0.99,method='higher'))
    assert calibrated==metadata['calibration']['threshold']
    assert review_recommended(calibrated,calibrated) is False
    assert review_recommended(calibrated+1e-9,calibrated) is True
    assert review_recommended(calibrated-1e-9,calibrated) is False

def test_ordinary_and_extreme_valid_values_keep_raw_finite_mse_scores():
    ordinary={'policy_type':'home','requested_coverage':350000,'deductible':1000,'payment_frequency':'monthly','channel':'web','submission_velocity_24h':1,'recent_change_count':0}
    extreme={**ordinary,'application_id':'SYNTH-EXTREME-1','requested_coverage':42_000_000,'deductible':3_900_000,'submission_velocity_24h':900,'recent_change_count':460}
    with TestClient(app) as client:
        normal_response=client.post('/api/v1/score',json=ordinary)
        extreme_response=client.post('/api/v1/score',json=extreme)
    assert normal_response.status_code==200
    assert extreme_response.status_code==200
    normal=normal_response.json(); outlier=extreme_response.json()
    assert np.isfinite(normal['anomaly_score']) and np.isfinite(outlier['anomaly_score'])
    assert normal['review_recommended']==review_recommended(normal['anomaly_score'],normal['threshold'])
    assert outlier['review_recommended']==review_recommended(outlier['anomaly_score'],outlier['threshold'])
    assert outlier['anomaly_score']>normal['anomaly_score']
    assert outlier['threshold']==normal['threshold']

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
