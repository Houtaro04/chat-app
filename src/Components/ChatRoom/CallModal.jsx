import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, Button, Input, Switch, Space, Typography, Tag, Tooltip, message
} from "antd";
import {
  collection, doc, setDoc, getDoc, addDoc, deleteDoc,
  onSnapshot, updateDoc, query, where, orderBy, serverTimestamp,
} from "firebase/firestore";
import { createPortal } from "react-dom";
import { db } from "../../firebase/config";

const { Text } = Typography;

// ------------------------ RTC config (STUN free) ------------------------
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ========================= Popup Portal =========================
function WindowPortal({
  title = "Call",
  features = "width=1000,height=720,left=120,top=80,menubar=no,toolbar=no,location=no,status=no",
  onClose,
  children,
}) {
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);
  const winRef = useRef(null);

  useEffect(() => {
    const container = document.createElement("div");
    containerRef.current = container;

    const w = window.open("", "_blank", features);
    if (!w) return;

    winRef.current = w;
    const mount = () => {
      try {
        w.document.title = title;

        // Clone CSS (antd + styled-components)
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
          try { w.document.head.appendChild(n.cloneNode(true)); } catch {}
        });

        // Base CSS
        const base = w.document.createElement("style");
        base.textContent = `
          :root{
            --panel: rgba(255,255,255,.06);
            --panel-2: rgba(255,255,255,.08);
            --border: rgba(255,255,255,.14);
            --shadow: 0 10px 30px rgba(0,0,0,.35);
          }
          html,body{height:100%;margin:0;background:linear-gradient(120deg,#0b0e14,#151a22);color:#fff;
            font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
          *{box-sizing:border-box}
          .cw-root{height:100%;display:flex;flex-direction:column;gap:12px;padding:12px;}
          .cw-header{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--border);
            border-radius:14px;padding:8px 10px;backdrop-filter:blur(8px);box-shadow:var(--shadow);}
          .cw-videos{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0}
          .cw-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:12px;flex:1;min-height:0}
          .cw-pane{position:relative;display:flex;flex-direction:column;gap:6px;background:var(--panel-2);
            border:1px solid var(--border);border-radius:14px;padding:10px;box-shadow:var(--shadow);min-height:180px;}
          .cw-video{width:100%;height:100%;object-fit:cover;background:#000;border-radius:10px;}
          .cw-name{position:absolute;left:12px;bottom:12px;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:8px;font-size:12px}
          .cw-footer{opacity:.7}
        `;
        w.document.head.appendChild(base);

        w.document.body.appendChild(container);
        setReady(true);
        w.focus();
      } catch {}
    };

    if (w.document.readyState === "complete") mount();
    else w.addEventListener("load", mount, { once: true });

    const unload = () => onClose?.();
    w.addEventListener("beforeunload", unload);

    return () => {
      try { w.removeEventListener("beforeunload", unload); } catch {}
      try { w.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, features]);

  if (!ready || !winRef.current) return null;
  return createPortal(children, containerRef.current);
}

// ========================= Helpers =========================
const safeCopy = async (text) => {
  try {
    if (!document.hasFocus()) window.focus();
    await navigator.clipboard.writeText(text);
    message.success("Đã copy");
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      message.success("Đã copy");
    } catch { message.warning("Không thể copy. Hãy bôi đen và Ctrl+C"); }
  }
};

// ========================= 1–1 Call Window =========================
function OneToOneWindow({ mode, me, roomId, defaultVideo = true, joinIdInitial = "", onExit }) {
  const [isVideo, setIsVideo] = useState(defaultVideo);
  const [creating, setCreating] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [callId, setCallId] = useState("");
  const [joinId, setJoinId] = useState(joinIdInitial);

  // NEW: trạng thái mic/cam
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubDocRef = useRef(null);
  const unsubCalleeRef = useRef(null);
  const unsubCallerRef = useRef(null);

  const cleanup = async () => {
    try { unsubDocRef.current && unsubDocRef.current(); } catch {}
    try { unsubCalleeRef.current && unsubCalleeRef.current(); } catch {}
    try { unsubCallerRef.current && unsubCallerRef.current(); } catch {}
    unsubDocRef.current = unsubCalleeRef.current = unsubCallerRef.current = null;

    if (pcRef.current) { pcRef.current.onicecandidate = null; pcRef.current.ontrack = null; pcRef.current.close(); }
    pcRef.current = null;

    localStreamRef.current?.getTracks()?.forEach(t => t.stop());
    remoteStreamRef.current?.getTracks()?.forEach(t => t.stop());

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };
  useEffect(() => () => { cleanup(); }, []);

  // Lấy media và áp dụng trạng thái mic/cam hiện tại
  const getMedia = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    // áp dụng enable/disable theo state
    s.getAudioTracks().forEach(t => (t.enabled = micOn));
    s.getVideoTracks().forEach(t => (t.enabled = camOn));

    localStreamRef.current = s;
    if (localVideoRef.current) localVideoRef.current.srcObject = s;
    return s;
  };

  // NEW: toggle mic/cam
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStreamRef.current?.getAudioTracks()?.forEach(t => (t.enabled = next));
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    localStreamRef.current?.getVideoTracks()?.forEach(t => (t.enabled = next));
  };

  const createPeer = () => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    pc.ontrack = (e) => e.streams[0]?.getTracks()?.forEach(t => remoteStream.addTrack(t));
    pcRef.current = pc;
    return pc;
  };

  const createCall = async () => {
    setCreating(true);
    try {
      const stream = await getMedia();
      const pc = createPeer();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const callDocRef = doc(collection(db, "calls"));
      const callerCandidatesCol = collection(callDocRef, "callerCandidates");
      const calleeCandidatesCol = collection(callDocRef, "calleeCandidates");

      await setDoc(callDocRef, {
        roomId: roomId || null,
        kind: isVideo ? "video" : "audio",
        createdAt: serverTimestamp(),
        caller: me?.uid || null,
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(callerCandidatesCol, event.candidate.toJSON());
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(callDocRef, { offer });

      unsubDocRef.current = onSnapshot(callDocRef, async (snap) => {
        const data = snap.data();
        if (data?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });

      unsubCalleeRef.current = onSnapshot(calleeCandidatesCol, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
      });

      setCallId(callDocRef.id);
      message.success("Đã tạo cuộc gọi – gửi Call ID cho đối phương!");
    } catch (err) {
      console.error(err);
      message.error(err.message || "Lỗi tạo cuộc gọi");
    } finally {
      setCreating(false);
    }
  };

  const answerCall = async () => {
    if (!joinId) return;
    setAnswering(true);
    try {
      const callDocRef = doc(db, "calls", joinId);
      const callSnap = await getDoc(callDocRef);
      if (!callSnap.exists()) {
        message.error("Call ID không tồn tại.");
        setAnswering(false);
        return;
      }

      const data = callSnap.data();
      const stream = await getMedia();
      const pc = createPeer();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const callerCandidatesCol = collection(callDocRef, "callerCandidates");
      const calleeCandidatesCol = collection(callDocRef, "calleeCandidates");

      pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(calleeCandidatesCol, event.candidate.toJSON());
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(callDocRef, { answer });

      unsubCallerRef.current = onSnapshot(callerCandidatesCol, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
      });

      setCallId(joinId);
      message.success("Đã trả lời – đang kết nối…");
    } catch (err) {
      console.error(err);
      message.error(err.message || "Lỗi trả lời");
    } finally {
      setAnswering(false);
    }
  };

  const hangup = async () => {
    await cleanup();
    onExit?.();
    try { window.close(); } catch {}
  };

  useEffect(() => {
    if (mode === "create") createCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="cw-root">
      <div className="cw-header">
        <Tag color="geekblue">1–1</Tag>
        <Button onClick={hangup} danger>Thoát</Button>

        <span>Chế độ:</span>
        <Switch checkedChildren="Video" unCheckedChildren="Audio"
                checked={isVideo} onChange={setIsVideo} />

        {/* NEW: nút mic/cam */}
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={toggleMic}>{micOn ? "Mute mic" : "Unmute"}</Button>
          <Button onClick={toggleCam}>{camOn ? "Tắt cam" : "Mở cam"}</Button>
        </div>

        {mode === "create" ? (
          <Button type="primary" loading={creating} onClick={createCall}>Tạo cuộc gọi</Button>
        ) : (
          <>
            <Input placeholder="Nhập Call ID" value={joinId}
                   onChange={(e)=>setJoinId(e.target.value)} style={{ width: 280 }} />
            <Button loading={answering} onClick={answerCall}>Trả lời</Button>
          </>
        )}

        {callId && (
          <div style={{marginLeft:12, display:"flex", alignItems:"center", gap:8}}>
            <Text strong>Call ID:</Text>
            <Input readOnly value={callId} style={{ width: 320 }} onFocus={(e)=>e.target.select()} />
            <Button onClick={() => safeCopy(callId)}>Copy</Button>
          </div>
        )}
      </div>

      <div className="cw-videos">
        <div className="cw-pane">
          <Text strong>Local</Text>
          <video ref={localVideoRef} autoPlay playsInline muted className="cw-video" />
        </div>
        <div className="cw-pane">
          <Text strong>Remote</Text>
          <video ref={remoteVideoRef} autoPlay playsInline className="cw-video" />
        </div>
      </div>

      <Text className="cw-footer">
        STUN only — một số NAT “khó” có thể không kết nối được.
      </Text>
    </div>
  );
}


// ========================= Group Call Window =========================
function GroupWindow({ me, roomId, defaultVideo = true, onExit }) {
  const [isVideo, setIsVideo] = useState(defaultVideo);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  const [signalingOK, setSignalingOK] = useState(false);
  const [sigError, setSigError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const [peers, setPeers] = useState([]); // [{id, name}]
  const selfId = useMemo(
    () => (me?.uid ? `u_${me.uid}` : `g_${Math.random().toString(36).slice(2, 10)}`),
    [me?.uid]
  );

  // Firestore collections
  const roomKey = roomId || "default";
  const peersCol  = collection(db, "callRooms", roomKey, "peers");
  const signalsCol = collection(db, "callRooms", roomKey, "signals");

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map());       // peerId -> RTCPeerConnection
  const sendersRef = useRef(new Map());   // peerId -> {audio, video}
  const videosRef = useRef(new Map());    // peerId -> HTMLVideoElement
  const mediaStreamsRef = useRef(new Map()); // peerId -> MediaStream (remote)
  const screenTrackRef = useRef(null);

  // Attach video element for each peer tile
  const setVideoRef = (peerId, el) => {
    if (el) {
      videosRef.current.set(peerId, el);
      const st = mediaStreamsRef.current.get(peerId);
      if (st) el.srcObject = st;
    } else {
      videosRef.current.delete(peerId);
    }
  };

  const getMedia = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    localStreamRef.current = s;

    // default on/off state
    s.getAudioTracks().forEach(t => (t.enabled = micOn));
    s.getVideoTracks().forEach(t => (t.enabled = camOn));

    if (localVideoRef.current) localVideoRef.current.srcObject = s;
    return s;
  };

  const createPcFor = (peerId) => {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // remote stream
    const remoteStream = new MediaStream();
    mediaStreamsRef.current.set(peerId, remoteStream);
    const el = videosRef.current.get(peerId);
    if (el) el.srcObject = remoteStream;

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks()?.forEach((t) => remoteStream.addTrack(t));
    };

    // add local tracks
    const ls = localStreamRef.current;
    const senders = {};
    ls?.getTracks()?.forEach((t) => {
      const sender = pc.addTrack(t, ls);
      if (t.kind === "audio") senders.audio = sender;
      if (t.kind === "video") senders.video = sender;
    });
    sendersRef.current.set(peerId, senders);

    // send ICE
    pc.onicecandidate = async (ev) => {
      if (ev.candidate) {
        try {
          await addDoc(signalsCol, {
            type: "candidate",
            to: peerId,
            from: selfId,
            candidate: ev.candidate.toJSON(),
            ts: serverTimestamp(),
          });
        } catch (e) { console.error(e); }
      }
    };

    pcsRef.current.set(peerId, pc);
    return pc;
  };

  // Call flow helpers
  const makeOfferTo = async (peerId) => {
    const pc = createPcFor(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await addDoc(signalsCol, {
      type: "offer",
      to: peerId,
      from: selfId,
      sdp: offer.sdp,
      ts: serverTimestamp(),
    });
  };

  const answerOfferFrom = async (peerId, sdp) => {
    const pc = createPcFor(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await addDoc(signalsCol, {
      type: "answer",
      to: peerId,
      from: selfId,
      sdp: ans.sdp,
      ts: serverTimestamp(),
    });
  };

  const applyAnswerFrom = async (peerId, sdp) => {
    const pc = pcsRef.current.get(peerId);
    if (!pc) return;
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    }
  };

  const addCandidateFrom = async (peerId, candidate) => {
    const pc = pcsRef.current.get(peerId);
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.error(e); }
  };

  // UI actions
  const toggleMic = () => {
    const on = !micOn;
    setMicOn(on);
    localStreamRef.current?.getAudioTracks()?.forEach((t) => (t.enabled = on));
  };
  const toggleCam = () => {
    const on = !camOn;
    setCamOn(on);
    localStreamRef.current?.getVideoTracks()?.forEach((t) => (t.enabled = on));
  };
  const shareScreen = async () => {
    if (sharing) return stopShare();
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = ds.getVideoTracks()[0];
      screenTrackRef.current = track;
      setSharing(true);

      // replace for all peers
      sendersRef.current.forEach((senders) => {
        if (senders.video) senders.video.replaceTrack(track);
      });

      // show on local
      const ls = localStreamRef.current;
      const [old] = ls.getVideoTracks();
      if (old) ls.removeTrack(old);
      ls.addTrack(track);
      if (localVideoRef.current) localVideoRef.current.srcObject = ls;

      track.onended = () => stopShare();
    } catch (e) {
      console.error(e);
      message.error("Không thể chia sẻ màn hình");
    }
  };
  const stopShare = () => {
    const ls = localStreamRef.current;
    const cam = ls?.getVideoTracks()?.[0];
    if (!cam) return;

    const backToCam = async () => {
      // thay lại track camera (đã có sẵn trong local stream)
      sendersRef.current.forEach((senders) => {
        if (senders.video) senders.video.replaceTrack(cam);
      });
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      setSharing(false);
    };

    // Nếu track hiện tại chính là track share => cần lấy lại camera thật
    if (screenTrackRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true }).then((camStream) => {
        const camTrack = camStream.getVideoTracks()[0];
        // thay vào local stream
        const old = ls.getVideoTracks()[0];
        if (old) ls.removeTrack(old);
        ls.addTrack(camTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = ls;

        // thay vào senders
        sendersRef.current.forEach((senders) => {
          if (senders.video) senders.video.replaceTrack(camTrack);
        });

        screenTrackRef.current?.stop();
        screenTrackRef.current = null;
        setSharing(false);
      });
    } else {
      backToCam();
    }
  };

  const hangup = async () => {
    // remove presence
    try { await deleteDoc(doc(peersCol, selfId)); } catch {}
    pcsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    pcsRef.current.clear();
    localStreamRef.current?.getTracks()?.forEach(t => t.stop());
    onExit?.();
    try { window.close(); } catch {}
  };

  // Core effect: always show Local first, then connect signaling
  useEffect(() => {
    let unsubPeers = () => {};
    let unsubSignals = () => {};
    const onUnload = () => { try { deleteDoc(doc(peersCol, selfId)); } catch {} };

    (async () => {
      // 1) Always get local media first (so user sees their cam even if signaling down)
      try { await getMedia(); }
      catch (e) { message.error("Không truy cập được camera/micro: " + (e?.message || "")); return; }

      // 2) Firestore signaling
      try {
        await setDoc(doc(peersCol, selfId), {
          uid: me?.uid || null,
          name: me?.displayName || me?.uid || "Someone",
          joinedAt: serverTimestamp(),
        });
        window.addEventListener("beforeunload", onUnload);

        unsubPeers = onSnapshot(peersCol, (snap) => {
          const list = [];
          const exist = new Set();
          snap.forEach((d) => {
            const v = { id: d.id, ...(d.data() || {}) };
            list.push(v);
            exist.add(v.id);
          });
          setPeers(list);

          // cleanup PCs of peers that left
          [...pcsRef.current.keys()].forEach((pid) => {
            if (!exist.has(pid)) {
              try { pcsRef.current.get(pid)?.close(); } catch {}
              pcsRef.current.delete(pid);
              mediaStreamsRef.current.delete(pid);
              videosRef.current.delete(pid);
              sendersRef.current.delete(pid);
            }
          });

          // glare-avoid: the smaller id calls first
          list.filter(p => p.id !== selfId).forEach((p) => {
            const iCall = selfId < p.id;
            if (iCall && !pcsRef.current.has(p.id)) {
              makeOfferTo(p.id).catch(console.error);
            } else {
              // ensure pc exists so that when offer arrives we can answer quickly
              createPcFor(p.id);
            }
          });
        });

        unsubSignals = onSnapshot(
          query(signalsCol, where("to", "==", selfId), orderBy("ts", "asc")),
          (snap) => {
            snap.docChanges().forEach(async (ch) => {
              if (ch.type !== "added") return;
              const { type, from, sdp, candidate } = ch.doc.data() || {};
              try {
                if (type === "offer") await answerOfferFrom(from, sdp);
                else if (type === "answer") await applyAnswerFrom(from, sdp);
                else if (type === "candidate") await addCandidateFrom(from, candidate);
              } catch (e) { console.error(e); }
              finally { try { await deleteDoc(ch.doc.ref); } catch {} }
            });
          }
        );

        setSignalingOK(true);
        setSigError("");
      } catch (e) {
        console.error(e);
        setSignalingOK(false);
        setSigError(e?.message || "Không kết nối Firestore (emulator/rules?)");
      }
    })();

    return () => {
      try { unsubPeers(); } catch {}
      try { unsubSignals(); } catch {}
      try { window.removeEventListener("beforeunload", onUnload); } catch {}
      try { deleteDoc(doc(peersCol, selfId)); } catch {}
      pcsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
      pcsRef.current.clear();
      localStreamRef.current?.getTracks()?.forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, retryKey]);

  return (
    <div className="cw-root">
      <div className="cw-header">
        <Tag color="purple">Group</Tag>
        <Tooltip title="Thoát & đóng cửa sổ">
          <Button onClick={hangup} danger>Thoát</Button>
        </Tooltip>

        <span>Chế độ video:</span>
        <Switch checkedChildren="On" unCheckedChildren="Off" checked={isVideo} onChange={(v)=>{ setIsVideo(v); }} />

        <div style={{ marginLeft: 8, display: "flex", gap: 8 }}>
          <Button onClick={toggleMic}>{micOn ? "Mute mic" : "Unmute"}</Button>
          <Button onClick={toggleCam}>{camOn ? "Tắt cam" : "Mở cam"}</Button>
          <Button onClick={sharing ? stopShare : shareScreen}>
            {sharing ? "Dừng share" : "Share screen"}
          </Button>
        </div>

        <Text type="secondary" style={{ marginLeft: "auto" }}>
          Người trong phòng: {peers.length}
        </Text>

        {signalingOK ? (
          <Tag color="green" style={{ marginLeft: 8 }}>Signaling OK</Tag>
        ) : (
          <>
            <Tag color="red" style={{ marginLeft: 8 }}>Signaling OFF</Tag>
            {sigError && <Text type="secondary" style={{ opacity:.8, marginLeft: 6 }}>· {sigError}</Text>}
            <Button size="small" onClick={() => setRetryKey(k => k + 1)} style={{ marginLeft: 6 }}>Thử lại</Button>
          </>
        )}
      </div>

      {/* Grid: local + all remote peers */}
      <div className="cw-grid">
        <div className="cw-pane">
          <span className="cw-name">Bạn</span>
          <video ref={localVideoRef} autoPlay playsInline muted className="cw-video" />
        </div>

        {peers.filter(p => p.id !== selfId).map(p => (
          <div key={p.id} className="cw-pane">
            <span className="cw-name">{p.name || p.id}</span>
            <video
              ref={(el) => setVideoRef(p.id, el)}
              autoPlay
              playsInline
              className="cw-video"
            />
          </div>
        ))}
      </div>

      <Text className="cw-footer">
        STUN only — NAT “khó” có thể không kết nối được. Muốn ổn định/đa người hơn hãy dùng TURN/SFU.
      </Text>
    </div>
  );
}

// ========================= Launcher (Modal trong app chính) =========================
export default function CallModal({ open, onClose, me, roomId }) {
  const [mode, setMode] = useState("one"); // "one" | "group"
  const [isVideo, setIsVideo] = useState(true);
  const [popup, setPopup] = useState(null);
  const [joinId, setJoinId] = useState("");

  const handlePopupClose = () => { setPopup(null); onClose?.(); };

  return (
    <>
      <Modal
        title="Gọi thoại / video"
        open={open}
        onCancel={onClose}
        footer={null}
        destroyOnClose
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap>
            <Text strong>Chế độ:</Text>
            <Button type={mode === "one" ? "primary" : "default"} onClick={()=>setMode("one")}>1–1</Button>
            <Button type={mode === "group" ? "primary" : "default"} onClick={()=>setMode("group")}>Nhóm</Button>
          </Space>

          <Space wrap>
            <span>Video:</span>
            <Switch checkedChildren="On" unCheckedChildren="Off"
                    checked={isVideo} onChange={setIsVideo} />
          </Space>

          {mode === "one" ? (
            <>
              <Space wrap>
                <Button type="primary" onClick={() => setPopup({ type:"one", mode:"create", joinId:"" })}>
                  Mở cửa sổ & Tạo cuộc gọi
                </Button>
              </Space>

              <Space wrap>
                <Input
                  placeholder="Nhập Call ID để trả lời"
                  value={joinId}
                  onChange={(e)=>setJoinId(e.target.value)}
                  style={{ width: 300 }}
                />
                <Button onClick={() => joinId && setPopup({ type:"one", mode:"answer", joinId })}>
                  Mở cửa sổ & Trả lời
                </Button>
              </Space>
            </>
          ) : (
            <Space wrap>
              <Button type="primary" onClick={() => setPopup({ type:"group" })}>
                Mở cửa sổ gọi nhóm
              </Button>
              <Text type="secondary">Phòng: <code>{roomId || "default"}</code></Text>
            </Space>
          )}
        </Space>
      </Modal>

      {popup && popup.type === "one" && (
        <WindowPortal title="Call 1–1" onClose={handlePopupClose}>
          <OneToOneWindow
            mode={popup.mode}
            me={me}
            roomId={roomId}
            defaultVideo={isVideo}
            joinIdInitial={popup.joinId || ""}
            onExit={handlePopupClose}
          />
        </WindowPortal>
      )}

      {popup && popup.type === "group" && (
        <WindowPortal title="Call nhóm" onClose={handlePopupClose}>
          <GroupWindow
            me={me}
            roomId={roomId}
            defaultVideo={isVideo}
            onExit={handlePopupClose}
          />
        </WindowPortal>
      )}
    </>
  );
}
