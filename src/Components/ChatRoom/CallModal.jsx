import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Input, Switch, Space, Typography } from "antd";
import { db } from "../../firebase/config";
import {
  collection, doc, setDoc, getDoc, addDoc,
  onSnapshot, updateDoc, serverTimestamp
} from "firebase/firestore";

const { Text } = Typography;

// Dùng STUN miễn phí của Google (không tốn phí)
const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function CallModal({ open, onClose, me, roomId }) {
  const [isVideo, setIsVideo]       = useState(true);
  const [creating, setCreating]     = useState(false);
  const [answering, setAnswering]   = useState(false);
  const [callId, setCallId]         = useState("");
  const [joinId, setJoinId]         = useState("");

  const pcRef = useRef(null);
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubDocRef     = useRef(null);
  const unsubCalleeRef  = useRef(null);
  const unsubCallerRef  = useRef(null);

  // Dọn tài nguyên
  const cleanup = async () => {
    try { unsubDocRef.current && unsubDocRef.current(); } catch {}
    try { unsubCalleeRef.current && unsubCalleeRef.current(); } catch {}
    try { unsubCallerRef.current && unsubCallerRef.current(); } catch {}
    unsubDocRef.current = unsubCalleeRef.current = unsubCallerRef.current = null;

    if (pcRef.current) { pcRef.current.onicecandidate = null; pcRef.current.ontrack = null; pcRef.current.close(); }
    pcRef.current = null;

    localStreamRef.current?.getTracks()?.forEach(t => t.stop());
    remoteStreamRef.current?.getTracks()?.forEach(t => t.stop());

    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setCreating(false);
    setAnswering(false);
  };

  useEffect(() => {
    if (!open) cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

    // Remote stream
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t));
    };

    pcRef.current = pc;
    return pc;
  };

  // --- Tạo cuộc gọi: tạo doc /calls, sinh offer, chờ answer ---
  const createCall = async () => {
    setCreating(true);
    try {
      const stream = await getMedia();
      const pc = createPeer();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // Tạo call doc
      const callDocRef = doc(collection(db, "calls"));
      const callerCandidatesCol = collection(callDocRef, "callerCandidates");
      const calleeCandidatesCol = collection(callDocRef, "calleeCandidates");

      await setDoc(callDocRef, {
        roomId: roomId || null,
        kind: isVideo ? "video" : "audio",
        createdAt: serverTimestamp(),
        caller: me?.uid || null,
      });

      // Ghi ICE của người gọi
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCol, event.candidate.toJSON());
        }
      };

      // Tạo offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(callDocRef, { offer });

      // Chờ answer
      unsubDocRef.current = onSnapshot(callDocRef, async (snap) => {
        const data = snap.data();
        if (data?.answer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });

      // Nhận ICE từ người nhận
      unsubCalleeRef.current = onSnapshot(calleeCandidatesCol, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const cand = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(cand);
          }
        });
      });

      setCallId(callDocRef.id);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // --- Trả lời cuộc gọi bằng ID ---
  const answerCall = async () => {
    if (!joinId) return;
    setAnswering(true);
    try {
      const callDocRef = doc(db, "calls", joinId);
      const callSnap = await getDoc(callDocRef);
      if (!callSnap.exists()) {
        setAnswering(false);
        return;
      }

      const data = callSnap.data();
      const stream = await getMedia();
      const pc = createPeer();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const callerCandidatesCol = collection(callDocRef, "callerCandidates");
      const calleeCandidatesCol = collection(callDocRef, "calleeCandidates");

      // Ghi ICE của người nhận
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(calleeCandidatesCol, event.candidate.toJSON());
        }
      };

      // Set remote offer -> create local answer
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(callDocRef, { answer });

      // Nhận ICE của caller
      unsubCallerRef.current = onSnapshot(callerCandidatesCol, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const cand = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(cand);
          }
        });
      });

      setCallId(joinId);
    } catch (err) {
      console.error(err);
    } finally {
      setAnswering(false);
    }
  };

  const hangup = async () => {
    await cleanup();
    onClose?.();
  };

  return (
    <Modal
      title="Cuộc gọi P2P (WebRTC + STUN miễn phí)"
      open={open}
      onCancel={hangup}
      footer={null}
      width={820}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space wrap>
          <span>Chế độ:</span>
          <Switch checkedChildren="Video" unCheckedChildren="Audio" checked={isVideo} onChange={setIsVideo} />
          <Button type="primary" loading={creating} onClick={createCall}>
            Tạo cuộc gọi
          </Button>
          <Text type="secondary">hoặc</Text>
          <Input
            placeholder="Nhập Call ID để trả lời"
            value={joinId}
            onChange={(e)=>setJoinId(e.target.value)}
            style={{ width: 260 }}
          />
          <Button loading={answering} onClick={answerCall}>
            Trả lời
          </Button>
          <Button danger onClick={hangup}>
            Kết thúc
          </Button>
        </Space>

        {callId && (
          <div>
            <Text strong>Call ID:</Text>{" "}
            <Input
              readOnly
              value={callId}
              style={{ width: 320 }}
              onFocus={(e)=>e.target.select()}
            />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              Gửi ID này cho người kia để họ nhập “Trả lời”
            </Text>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Text strong>Local</Text>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", background: "#000", borderRadius: 8 }}
            />
          </div>
          <div>
            <Text strong>Remote</Text>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: "100%", background: "#000", borderRadius: 8 }}
            />
          </div>
        </div>

        <Text type="secondary">
          Lưu ý: dùng STUN nên đôi khi các mạng NAT “khó” có thể không kết nối được. Muốn ổn định hơn cần thêm TURN (thường tính phí).
        </Text>
      </Space>
    </Modal>
  );
}
