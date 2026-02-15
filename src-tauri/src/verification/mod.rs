use std::time::{SystemTime, UNIX_EPOCH};

use libp2p::identity;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::protocol::identity::VerificationProof;
use crate::protocol::messages::{ProfileAnnouncement, ProfileRevocation};

// -- challenge data structures received from the frontend --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseSample {
    pub x: f64,
    pub y: f64,
    pub t: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentData {
    pub from_target: u32,
    pub to_target: u32,
    pub samples: Vec<MouseSample>,
    pub click_time: f64,
    pub start_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCircle {
    pub id: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeSubmission {
    pub segments: Vec<SegmentData>,
    pub circles: Vec<TargetCircle>,
    pub total_start_time: f64,
    pub total_end_time: f64,
}

pub struct AnalysisResult {
    pub is_human: bool,
    pub score: f64,
}

const HUMAN_THRESHOLD: f64 = 0.35;

// -- behavioral analysis functions --
// these mirror the typescript implementations exactly, running in compiled rust
// so the analysis logic is not exposed in the inspectable webview

fn score_timing_variance(segments: &[SegmentData]) -> f64 {
    if segments.len() < 2 {
        return 0.0;
    }

    let intervals: Vec<f64> = segments.iter().map(|s| s.click_time - s.start_time).collect();
    let mean = intervals.iter().sum::<f64>() / intervals.len() as f64;
    if mean == 0.0 {
        return 0.0;
    }

    let variance = intervals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / intervals.len() as f64;
    let cv = variance.sqrt() / mean;

    // humans have natural variance in click timing
    // bots tend to be metronomic or instantaneous
    if cv < 0.03 {
        0.0
    } else if cv < 0.08 {
        0.3
    } else if cv < 0.12 {
        0.6
    } else {
        1.0
    }
}

fn score_path_curvature(segments: &[SegmentData]) -> f64 {
    let mut ratios = Vec::new();

    for seg in segments {
        if seg.samples.len() < 3 {
            continue;
        }

        let first = &seg.samples[0];
        let last = &seg.samples[seg.samples.len() - 1];
        let straight_dist = ((last.x - first.x).powi(2) + (last.y - first.y).powi(2)).sqrt();

        // skip very short movements where curvature is meaningless
        if straight_dist < 10.0 {
            continue;
        }

        let mut path_length = 0.0;
        for i in 1..seg.samples.len() {
            let dx = seg.samples[i].x - seg.samples[i - 1].x;
            let dy = seg.samples[i].y - seg.samples[i - 1].y;
            path_length += (dx * dx + dy * dy).sqrt();
        }

        ratios.push(path_length / straight_dist);
    }

    if ratios.is_empty() {
        return 0.0;
    }

    let avg_ratio = ratios.iter().sum::<f64>() / ratios.len() as f64;

    // humans never move in perfectly straight lines
    if avg_ratio < 1.02 {
        0.0
    } else if avg_ratio < 1.06 {
        0.3
    } else if avg_ratio < 1.10 {
        0.6
    } else if avg_ratio > 4.0 {
        0.5
    } else {
        1.0
    }
}

fn score_speed_variance(segments: &[SegmentData]) -> f64 {
    let mut all_speed_cvs = Vec::new();

    for seg in segments {
        if seg.samples.len() < 5 {
            continue;
        }

        let mut speeds = Vec::new();
        for i in 1..seg.samples.len() {
            let dx = seg.samples[i].x - seg.samples[i - 1].x;
            let dy = seg.samples[i].y - seg.samples[i - 1].y;
            let dt = seg.samples[i].t - seg.samples[i - 1].t;
            if dt > 0.0 {
                speeds.push((dx * dx + dy * dy).sqrt() / dt);
            }
        }

        if speeds.len() < 3 {
            continue;
        }

        let mean = speeds.iter().sum::<f64>() / speeds.len() as f64;
        if mean == 0.0 {
            continue;
        }

        let variance = speeds.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / speeds.len() as f64;
        let cv = variance.sqrt() / mean;
        all_speed_cvs.push(cv);
    }

    if all_speed_cvs.is_empty() {
        return 0.0;
    }

    let avg_cv = all_speed_cvs.iter().sum::<f64>() / all_speed_cvs.len() as f64;

    // humans accelerate and decelerate naturally
    if avg_cv < 0.1 {
        0.0
    } else if avg_cv < 0.25 {
        0.4
    } else if avg_cv < 0.4 {
        0.7
    } else {
        1.0
    }
}

fn score_approach_jitter(segments: &[SegmentData], circles: &[TargetCircle]) -> f64 {
    let mut jitter_scores = Vec::new();

    for (i, seg) in segments.iter().enumerate() {
        if i >= circles.len() || seg.samples.len() < 5 {
            continue;
        }

        let target = &circles[i];

        // isolate the last stretch approaching the target
        let approach_samples: Vec<&MouseSample> = seg
            .samples
            .iter()
            .filter(|s| {
                let dx = s.x - target.x;
                let dy = s.y - target.y;
                (dx * dx + dy * dy).sqrt() < 60.0
            })
            .collect();

        if approach_samples.len() < 4 {
            continue;
        }

        // count direction changes via cross product sign flips
        let mut direction_changes = 0u32;
        for j in 2..approach_samples.len() {
            let dx1 = approach_samples[j - 1].x - approach_samples[j - 2].x;
            let dy1 = approach_samples[j - 1].y - approach_samples[j - 2].y;
            let dx2 = approach_samples[j].x - approach_samples[j - 1].x;
            let dy2 = approach_samples[j].y - approach_samples[j - 1].y;

            let cross = dx1 * dy2 - dy1 * dx2;
            if j > 2 {
                let prev_dx1 = approach_samples[j - 2].x - approach_samples[j - 3].x;
                let prev_dy1 = approach_samples[j - 2].y - approach_samples[j - 3].y;
                let prev_cross = prev_dx1 * dy1 - prev_dy1 * dx1;
                if cross * prev_cross < 0.0 {
                    direction_changes += 1;
                }
            }
        }

        let jitter_ratio = direction_changes as f64 / (approach_samples.len() - 2).max(1) as f64;
        jitter_scores.push(jitter_ratio);
    }

    // not enough data to judge, give a neutral score
    if jitter_scores.is_empty() {
        return 0.5;
    }

    let avg_jitter = jitter_scores.iter().sum::<f64>() / jitter_scores.len() as f64;

    // humans have micro-corrections from motor noise
    if avg_jitter < 0.01 {
        0.2
    } else if avg_jitter < 0.05 {
        0.5
    } else {
        1.0
    }
}

fn score_overall_timing(total_start: f64, total_end: f64) -> f64 {
    let total_sec = (total_end - total_start) / 1000.0;

    if total_sec < 0.8 {
        0.0
    } else if total_sec < 1.5 {
        0.3
    } else if total_sec > 60.0 {
        0.5
    } else {
        1.0
    }
}

pub fn analyze_challenge(data: &ChallengeSubmission) -> AnalysisResult {
    let timing = score_timing_variance(&data.segments);
    let curvature = score_path_curvature(&data.segments);
    let speed = score_speed_variance(&data.segments);
    let jitter = score_approach_jitter(&data.segments, &data.circles);
    let overall = score_overall_timing(data.total_start_time, data.total_end_time);

    let score = timing * 0.25 + curvature * 0.25 + speed * 0.20 + jitter * 0.20 + overall * 0.10;

    AnalysisResult {
        is_human: score >= HUMAN_THRESHOLD,
        score,
    }
}

// -- proof generation --

pub fn generate_proof(
    challenge: &ChallengeSubmission,
    keypair: &identity::Keypair,
    peer_id: &str,
) -> Result<VerificationProof, String> {
    let result = analyze_challenge(challenge);
    if !result.is_human {
        return Err("behavioral analysis did not pass human threshold".to_string());
    }

    // hash the raw challenge data to create a fingerprint
    let challenge_bytes =
        serde_json::to_vec(challenge).map_err(|e| format!("failed to serialize challenge: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&challenge_bytes);
    let metrics_hash = hex::encode(hasher.finalize());

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // sign (metrics_hash || peer_id || timestamp) to bind the proof to this keypair
    let sign_payload = format!("{}||{}||{}", metrics_hash, peer_id, timestamp);
    let signature = keypair
        .sign(sign_payload.as_bytes())
        .map_err(|e| format!("failed to sign proof: {}", e))?;

    Ok(VerificationProof {
        metrics_hash,
        signature: hex::encode(signature),
        timestamp,
        score: result.score,
    })
}

// -- profile announcement signing --

// build the canonical payload that gets signed for an announcement
fn announcement_sign_payload(
    peer_id: &str,
    display_name: &str,
    bio: &str,
    public_key: &str,
    timestamp: u64,
    metrics_hash: &str,
) -> Vec<u8> {
    format!(
        "dusk-announce||{}||{}||{}||{}||{}||{}",
        peer_id, display_name, bio, public_key, timestamp, metrics_hash
    )
    .into_bytes()
}

pub fn sign_announcement(keypair: &identity::Keypair, announcement: &ProfileAnnouncement) -> String {
    let metrics_hash = announcement
        .verification_proof
        .as_ref()
        .map(|p| p.metrics_hash.as_str())
        .unwrap_or("");

    let payload = announcement_sign_payload(
        &announcement.peer_id,
        &announcement.display_name,
        &announcement.bio,
        &announcement.public_key,
        announcement.timestamp,
        metrics_hash,
    );

    match keypair.sign(&payload) {
        Ok(sig) => hex::encode(sig),
        Err(e) => {
            log::error!("failed to sign announcement: {}", e);
            String::new()
        }
    }
}

pub fn verify_announcement(public_key_hex: &str, announcement: &ProfileAnnouncement) -> bool {
    let pk_bytes = match hex::decode(public_key_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let public_key = match identity::PublicKey::try_decode_protobuf(&pk_bytes) {
        Ok(pk) => pk,
        Err(_) => return false,
    };

    let sig_bytes = match hex::decode(&announcement.signature) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let metrics_hash = announcement
        .verification_proof
        .as_ref()
        .map(|p| p.metrics_hash.as_str())
        .unwrap_or("");

    let payload = announcement_sign_payload(
        &announcement.peer_id,
        &announcement.display_name,
        &announcement.bio,
        &announcement.public_key,
        announcement.timestamp,
        metrics_hash,
    );

    public_key.verify(&payload, &sig_bytes)
}

// -- profile revocation signing --

fn revocation_sign_payload(peer_id: &str, public_key: &str, timestamp: u64) -> Vec<u8> {
    format!("dusk-revoke||{}||{}||{}", peer_id, public_key, timestamp).into_bytes()
}

pub fn sign_revocation(keypair: &identity::Keypair, revocation: &ProfileRevocation) -> String {
    let payload = revocation_sign_payload(
        &revocation.peer_id,
        &revocation.public_key,
        revocation.timestamp,
    );

    match keypair.sign(&payload) {
        Ok(sig) => hex::encode(sig),
        Err(e) => {
            log::error!("failed to sign revocation: {}", e);
            String::new()
        }
    }
}

pub fn verify_revocation(public_key_hex: &str, revocation: &ProfileRevocation) -> bool {
    let pk_bytes = match hex::decode(public_key_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let public_key = match identity::PublicKey::try_decode_protobuf(&pk_bytes) {
        Ok(pk) => pk,
        Err(_) => return false,
    };

    let sig_bytes = match hex::decode(&revocation.signature) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let payload = revocation_sign_payload(
        &revocation.peer_id,
        &revocation.public_key,
        revocation.timestamp,
    );

    public_key.verify(&payload, &sig_bytes)
}
