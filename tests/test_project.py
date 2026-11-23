import json, subprocess, sys
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from app.main import app, validate_bundle_metadata
from app.config import CALIBRATION_PATH, CATEGORICAL, FEATURES, METADATA_PATH, NUMERIC
from app.model import Preprocessor, VAE, read_csv, residuals, review_recommended, score_rows


def test_artifacts_and_health():
    with TestClient(app) as client:
        health=client.get('/api/v1/health').json()
        assert health['status']=='healthy' and health['model_loaded']
        info=client.get('/api/v1/model-info').json()
        assert info['model_version']=='1.0.0-demo'
        assert info['feature_schema']==FEATURES and len(info['feature_schema'])==7
        assert info['flag_evidence_schema'] and not set(info['flag_evidence_schema']) & set(FEATURES)
        assert info['calibration']['sample_size']==500
        assert info['calibration']['threshold']==0.06842832267284393
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
    scored=score_rows(model,pre,calibration)
    encoded,reconstructed,_=residuals(model,pre,calibration)
    expected_mse=np.mean((reconstructed-encoded)**2,axis=1)
    np.testing.assert_allclose([row[0] for row in scored],expected_mse,rtol=1e-7,atol=0)
    scores=[row[0] for row in scored]
    calibrated=float(np.quantile(scores,0.99,method='higher'))
    assert calibrated==metadata['calibration']['threshold']
    assert review_recommended(calibrated,calibrated) is False
    assert review_recommended(calibrated+1e-9,calibrated) is True
    assert review_recommended(calibrated-1e-9,calibrated) is False

def test_bundle_startup_rejects_version_or_scaler_mismatch_with_clear_errors():
    metadata=json.loads(METADATA_PATH.read_text())
    stale={**metadata,'model_version':'stale-demo'}
    try:
        validate_bundle_metadata(stale)
        assert False, 'stale model bundle should be rejected'
    except RuntimeError as exc:
        assert 'version mismatch' in str(exc)
    invalid=json.loads(json.dumps(metadata))
    invalid['preprocessor']['stds']['requested_coverage']=0
    try:
        validate_bundle_metadata(invalid)
        assert False, 'invalid fitted scaler should be rejected'
    except RuntimeError as exc:
        assert 'standard deviation for requested_coverage' in str(exc)

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

def test_legacy_api_request_gets_neutral_synthetic_consistency_defaults():
    legacy={'policy_type':'auto','requested_coverage':30000,'deductible':500,'payment_frequency':'monthly','channel':'web','submission_velocity_24h':1,'recent_change_count':0}
    with TestClient(app) as client:
        response=client.post('/api/v1/score',json=legacy)
    assert response.status_code==200
    assert np.isfinite(response.json()['anomaly_score'])

def test_flag_evidence_is_validated_separately_and_cannot_change_original_vae_score():
    record={'policy_type':'home','requested_coverage':350000,'deductible':1000,'payment_frequency':'monthly','channel':'web','submission_velocity_24h':1,'recent_change_count':0,'duplicate_identity_reference_count':3,'identity_document_consistency':0.2,'application_detail_consistency':0.4,'contact_reference_consistency':0.9,'beneficiary_reference_consistency':0.9,'repeat_submission_count':12}
    base={key:value for key,value in record.items() if key in FEATURES}
    with TestClient(app) as client:
        baseline=client.post('/api/v1/score',json=base)
        response=client.post('/api/v1/score',json=record)
        bad=client.post('/api/v1/score',json={**record,'contact_reference_consistency':1.5})
    assert response.status_code==200
    assert baseline.status_code==200
    assert response.json()['anomaly_score']==baseline.json()['anomaly_score']
    assert response.json()['threshold']==baseline.json()['threshold']==0.06842832267284393
    assert response.json()['review_recommended']==baseline.json()['review_recommended']
    assert response.json()['feature_deviations']==baseline.json()['feature_deviations']
    codes={flag['code'] for flag in response.json()['flags']}
    assert {'synthetic_consistency_deviation','repeated_opaque_reference_count','unusual_submission_behaviour'} <= codes
    assert bad.status_code==422

def test_frontend_build():
    if not (ROOT/'frontend/node_modules').exists(): return
    r=subprocess.run(['npm','run','build'],cwd=ROOT/'frontend',capture_output=True,text=True)
    assert r.returncode==0,r.stdout+'\n'+r.stderr
