// src/Components/Call/CallModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Input, Switch, Space, Typography, message } from "antd";
import { db } from "../../firebase/config";
import {
  collection, doc, setDoc, getDoc, addDoc,
  onSnapshot, updateDoc, serverTimestamp
} from "firebase/firestore";
import { createPortal } from "react-dom";

const { Text } = Typography;

// STUN miễn phí
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

/* =========================
 *  Popup Window Portal (đÃ SỬA)
 * ========================= */
function WindowPortal({ title = "Call", features = "width=960,height=700,left=120,top=80", onClose, children }) {
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

        // Clone CSS từ trang cha sang popup (antd + styled)
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
          try {
            w.document.head.appendChild(node.cloneNode(true));
          } catch {}
        });

        // CSS cơ bản cho nền & layout
        const base = w.document.createElement("style");
        base.textContent = `
          :root{
            --panel: rgba(255,255,255,.06);
            --border: rgba(255,255,255,.12);
            --shadow: 0 10px 30px rgba(0,0,0,.35);
          }
          html,body{height:100%;margin:0;background:linear-gradient(120deg,#0b0e14,#151a22);color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
          *{box-sizing:border-box}
          .cw-root{height:100%;display:flex;flex-direction:column;gap:12px;padding:14px;}
          .cw-header{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:10px 12px;backdrop-filter:blur(8px);box-shadow:var(--shadow);}
          .cw-videos{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0}
          .cw-pane{display:flex;flex-direction:column;gap:6px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:10px;box-shadow:var(--shadow);}
          .cw-video{width:100%;height:100%;object-fit:contain;background:#000;border-radius:10px;}
          .cw-footer{opacity:.7}
        `;
        w.document.head.appendChild(base);

        w.document.body.appendChild(container);
        setReady(true);
        w.focus(); // 🔥 đảm bảo popup được focus (fix copy & getUserMedia UX)
      } catch {}
    };

    if (w.document.readyState === "complete") mount();
    else w.addEventListener("load", mount, { once: true });

    const handleBeforeUnload = () => onClose?.();
    w.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      try { w.removeEventListener("beforeunload", handleBeforeUnload); } catch {}
      try { w.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, features]);

  if (!ready || !winRef.current) return null;
  return createPortal(children, containerRef.current);
}

/* =========================
 *  Core Call UI (render trong popup)
 * ========================= */
function CallWindow({ mode, me, roomId, defaultVideo = true, joinIdInitial = "", onExit }) {
  const [isVideo, setIsVideo] = useState(defaultVideo);
  const [creating, setCreating] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [callId, setCallId] = useState("");
  const [joinId, setJoinId] = useState(joinIdInitial);

  const pcRef = useRef(null);
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubDocRef     = useRef(null);
  const unsubCalleeRef  = useRef(null);
  const unsubCallerRef  = useRef(null);

  // dọn
  const cleanup = async () => {
    try { unsubDocRef.current && unsubDocRef.current(); } catch {}
    try { unsubCalleeRef.current && unsubCalleeRef.current(); } catch {}
    try { unsubCallerRef.current && unsubCallerRef.current(); } catch {}
    unsubDocRef.current = unsubCalleeRef.current = unsubCallerRef.current = null;

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
    }
    pcRef.current = null;

    localStreamRef.current?.getTracks()?.forEach(t => t.stop());
    remoteStreamRef.current?.getTracks()?.forEach(t => t.stop());

    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };
  useEffect(() => () => { cleanup(); }, []);

  const getMedia = async () => {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });
    localStreamRef.current = s;
    if (localVideoRef.current) localVideoRef.current.srcObject = s;
    return s;
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

  const safeCopy = async (text) => {
    try {
      if (!document.hasFocus()) window.focus();       // đảm bảo đang focus
      await navigator.clipboard.writeText(text);
      message.success("Đã copy Call ID");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        message.success("Đã copy Call ID");
      } catch {
        message.warning("Copy không khả dụng. Hãy bôi đen và nhấn Ctrl+C.");
      }
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
        <Button onClick={hangup} danger>Thoát</Button>
        <span>Chế độ:</span>
        <Switch checkedChildren="Video" unCheckedChildren="Audio"
                checked={isVideo} onChange={setIsVideo} />
        {mode === "create" ? (
          <Button type="primary" loading={creating} onClick={createCall}>
            Tạo cuộc gọi
          </Button>
        ) : (
          <>
            <Input
              placeholder="Nhập Call ID"
              value={joinId}
              onChange={(e)=>setJoinId(e.target.value)}
              style={{ width: 280 }}
            />
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
        Lưu ý: dùng STUN nên một số mạng NAT “khó” có thể không kết nối được. Muốn ổn định hơn cần thêm TURN (thường tính phí).
      </Text>
    </div>
  );
}

/* =========================
 *  Launcher trong cửa sổ chính
 * ========================= */
export default function CallModal({ open, onClose, me, roomId }) {
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
        <Space direction="vertical" size="middle" style={{ width:"100%" }}>
          <Space wrap>
            <span>Chế độ:</span>
            <Switch checkedChildren="Video" unCheckedChildren="Audio"
                    checked={isVideo} onChange={setIsVideo} />
          </Space>

          <Space wrap>
            <Button type="primary" onClick={() => setPopup({ mode:"create", joinId:"" })}>
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
            <Button onClick={() => joinId && setPopup({ mode:"answer", joinId })}>
              Mở cửa sổ & Trả lời
            </Button>
          </Space>
        </Space>
      </Modal>

      {popup && (
        <WindowPortal title="Call" onClose={handlePopupClose}>
          <CallWindow
            mode={popup.mode}
            me={me}
            roomId={roomId}
            defaultVideo={isVideo}
            joinIdInitial={popup.joinId || ""}
            onExit={handlePopupClose}
          />
        </WindowPortal>
      )}
    </>
  );
}
