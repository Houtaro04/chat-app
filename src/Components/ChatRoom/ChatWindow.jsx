// src/Components/ChatWindow/ChatWindow.jsx
import {
  UserAddOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  PaperClipOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import {
  Alert, Avatar, Input, Tooltip, Button, Progress, Modal, Upload,
  Dropdown, Space, message as antdMessage
} from "antd";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import styled from "styled-components";
import FormItem from "antd/es/form/FormItem";
import Form from "antd/es/form/Form";
import Message from "./Message";
import CallModal from "../Modals/CallModal";
import { AppContext } from "../../Context/AppProvider";
import { AuthContext } from "../../Context/AuthProvider";
import { addDocument } from "../../firebase/services";
import useFirestore from "../../Hooks/useFirestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, firebase } from "../../firebase/config";
import { createPortal } from "react-dom";
import emojiData from "@emoji-mart/data";
import { Navigate } from "react-router-dom";

const WrapperStyled = styled.div`height:100vh;`;
const HeaderStyled = styled.div`
  display:flex; justify-content:space-between; height:60px; padding:0 16px;
  align-items:center; border-bottom:1px solid rgb(230,230,230); background:#ebe7e1;
  .header{ &__info{display:flex; flex-direction:column; justify-content:center;}
    &__title{margin:0; font-weight:bold;} &__description{font-size:12px;} }
  border-radius:10px;
`;
const ButtonGroupStyled = styled.div`display:flex; align-items:center; gap:6px;`;
const ContentStyled = styled.div`height:calc(100vh - 85px); display:flex; flex-direction:column; padding:11px; justify-content:flex-end;`;
const FormStyled = styled(Form)`
  display:flex; align-items:center; gap:8px; padding:2px 6px 2px 4px;
  border:1px solid rgb(230,230,230); border-radius:15px;
  .ant-form-item{flex:1; margin-bottom:0;}
`;
const MessageListStyled = styled.div`max-height:100%; overflow-y:auto;`;

/* ============== Emoji ============== */
const EMOJI_MAP = emojiData?.emojis ?? emojiData ?? {};
const toNative = (unified) => {
  if (typeof unified !== "string") return null;
  try { return String.fromCodePoint(...unified.split("-").map(u=>parseInt(u,16))); }
  catch { return null; }
};
const EMOJIS = Object.values(EMOJI_MAP)
  .map(e => toNative(e?.skins?.[0]?.unified ?? e?.unified ?? null))
  .filter(Boolean);

const EMOJI_COLS = 10, EMOJI_SIZE = 28, EMOJI_GAP = 6;
const EMOJI_VISIBLE_ROWS = 10;
const EMOJI_PANEL_HEIGHT = EMOJI_VISIBLE_ROWS * EMOJI_SIZE + (EMOJI_VISIBLE_ROWS - 1) * EMOJI_GAP;

function EmojiPortal({ open, pos, onPick, onClose }) {
  if (!open) return null;
  return createPortal(
    <div
      style={{
        position:"fixed", left:pos.left, bottom:pos.bottom, zIndex:10050,
        background:"#fff", border:"1px solid #eee", borderRadius:8, padding:8,
        boxShadow:"0 8px 28px rgba(0,0,0,.18)", maxWidth: EMOJI_COLS*(EMOJI_SIZE+EMOJI_GAP)+16,
      }}
      onMouseDown={(e)=>e.preventDefault()}
    >
      <div style={{
        height:EMOJI_PANEL_HEIGHT, overflowY:"auto", paddingRight:4, WebkitOverflowScrolling:"touch"
      }}>
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${EMOJI_COLS}, ${EMOJI_SIZE}px)`, gap:EMOJI_GAP }}>
          {EMOJIS.map((ch,i)=>(
            <button key={`${ch}-${i}`} onClick={()=>onPick(ch)}
              style={{width:EMOJI_SIZE,height:EMOJI_SIZE,fontSize:20,lineHeight:`${EMOJI_SIZE}px`,
              border:"none",background:"transparent",cursor:"pointer"}}>
              {ch}
            </button>
          ))}
        </div>
      </div>
      <div style={{ textAlign:"right", marginTop:6 }}>
        <button onClick={onClose} style={{ fontSize:12 }}>Đóng</button>
      </div>
    </div>,
    document.body
  );
}

/* ===== Cloudinary unsigned upload ===== */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.warn("Missing Cloudinary env: VITE_CLOUDINARY_CLOUD or VITE_CLOUDINARY_PRESET");
}

// endpoint: thử 'image/video' trước, rồi fallback 'auto'
async function uploadToCloudinary(file, kind /* 'image' | 'video' */) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error("Thiếu CLOUD/PRESET trong .env");

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  const tryTypes = kind === "video" ? ["video", "auto"] : ["image", "auto"];
  let lastErr = "Upload failed";

  for (const type of tryTypes) {
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${type}/upload`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (res.ok) {
        return {
          url: json.secure_url,
          publicId: json.public_id,
          width: json.width,
          height: json.height,
          duration: json.duration,
          resourceType: json.resource_type,
        };
      }
      lastErr = json?.error?.message || lastErr;
    } catch (e) {
      lastErr = e?.message || lastErr;
    }
  }
  throw new Error(lastErr);
}

/* ===== Giới hạn dung lượng ===== */
const LIMIT_IMAGE = 10 * 1024 * 1024;   // 10MB
const LIMIT_VIDEO = 45 * 1024 * 1024;   // 45MB
const fmtBytes = (b) => `${(b/1024/1024).toFixed(1)} MB`;

export default function ChatWindow() {
  const { selectedRoom, members, setIsInviteMemberVisible, setSelectedRoomId } = useContext(AppContext);
  const [fbUser] = useAuthState(auth);
  const { user: ctxUser } = useContext(AuthContext) || {};
  const jwtUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("jwt_auth") || "null")?.user || null; }
    catch { return null; }
  }, []);

  const sessionUser = useMemo(() => {
    const u = ctxUser || (fbUser && { uid: fbUser.uid, displayName: fbUser.displayName, photoURL: fbUser.photoURL }) || jwtUser;
    if (!u) return null;
    return {
      uid: u.uid ?? u.id ?? u._id ?? u.username ?? null,
      displayName: u.displayName ?? u.username ?? "",
      photoURL: u.photoURL ?? "",
    };
  }, [ctxUser, fbUser, jwtUser]);

  const sessionUid = sessionUser?.uid;
  const sessionName = sessionUser?.displayName || "";
  const sessionPhoto = sessionUser?.photoURL || "";

  // Nếu chưa đăng nhập, đá về /login
  if (!sessionUid) return <Navigate to="/login" replace />;

  // === Nhận diện chủ phòng ===
  const ownerUid =
    selectedRoom?.ownerId ||
    selectedRoom?.createdBy ||
    selectedRoom?.owner ||
    selectedRoom?.creatorUid ||
    selectedRoom?.adminUid ||
    null;
  const isOwner = !!ownerUid && ownerUid === sessionUid;

  // ===== System message helpers =====
  const postSystemMessage = async (text) => {
    if (!selectedRoom?.id) return;
    try {
      await addDocument("messages", {
        text,
        roomId: selectedRoom.id,
        uid: "system",
        displayName: "Hệ thống",
        photoURL: "",
        isSystem: true,
        clientTime: Date.now(),
      });
    } catch (e) {
      console.warn("postSystemMessage error:", e?.message);
    }
  };

  // client "leader" = uid nhỏ nhất trong nhóm hiện tại => chỉ leader mới ghi log để tránh trùng
  const amLeader = useMemo(() => {
    const ids = (members || [])
      .map(m => m.uid || m.id)
      .filter(Boolean)
      .sort();
    return !!sessionUid && ids.length > 0 && ids[0] === sessionUid;
  }, [members, sessionUid]);

  // --- helper: lấy displayName theo uid nếu cần (fallback khi không có trong bộ nhớ cục bộ)
  const fetchDisplayNameByUid = async (uid) => {
    try {
      const snap = await firebase
        .firestore()
        .collection("users")
        .where("uid", "==", uid)
        .limit(1)
        .get();
      if (!snap.empty) {
        const u = snap.docs[0].data();
        return u.displayName || u.username || uid;
      }
    } catch (e) {
      console.warn("fetchDisplayNameByUid error:", e?.message);
    }
    return uid;
  };

  // ==== lưu snapshot members trước đó (để lấy displayName khi bị remove) ====
  const prevMembersRef = useRef(null);

  // reset snapshot khi đổi phòng
  useEffect(() => {
    prevMembersRef.current = null;
  }, [selectedRoom?.id]);

  // Phát hiện thêm / bớt thành viên => ghi system message (đảm bảo luôn hiện displayName)
  useEffect(() => {
    if (!selectedRoom?.id) return;

    const currMembers = members || [];
    const currIds = currMembers.map(m => m.uid || m.id).filter(Boolean);

    // lần đầu: chỉ lưu snapshot
    if (!prevMembersRef.current) {
      prevMembersRef.current = currMembers;
      return;
    }

    const prevMembers = prevMembersRef.current;
    const prevIds = prevMembers.map(m => m.uid || m.id).filter(Boolean);

    const prevSet = new Set(prevIds);
    const currSet = new Set(currIds);

    const added   = currIds.filter(id => !prevSet.has(id));
    const removed = prevIds.filter(id => !currSet.has(id));

    // tên: ưu tiên hiện tại -> snapshot cũ -> uid
    const nameFromLocal = (uid) =>
      currMembers.find(m => (m.uid || m.id) === uid)?.displayName ||
      prevMembers.find(m => (m.uid || m.id) === uid)?.displayName ||
      uid;

    if (amLeader) {
      (async () => {
        for (const uid of added) {
          let name = nameFromLocal(uid);
          if (name === uid) name = await fetchDisplayNameByUid(uid);
          await postSystemMessage(`${name} đã tham gia nhóm`);
        }
        for (const uid of removed) {
          let name = nameFromLocal(uid); // thường có trong snapshot cũ
          if (name === uid) name = await fetchDisplayNameByUid(uid); // fallback query users
          await postSystemMessage(`${name} đã rời nhóm`);
        }
      })();
    }

    // cập nhật snapshot cho lần so sánh sau
    prevMembersRef.current = currMembers;
  }, [members, selectedRoom?.id, amLeader]);

  // Modal xem danh sách thành viên
  const [membersOpen, setMembersOpen] = useState(false);

  const [inputValue, setInputValue] = useState("");
  const [openEmoji, setOpenEmoji] = useState(false);
  const [pickerPos, setPickerPos] = useState({ left: 16, bottom: 120 });
  const emojiBtnRef = useRef(null);

  // Popup media
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaType, setMediaType] = useState("image");
  const [fileList, setFileList] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [sizeError, setSizeError] = useState("");
  const [callOpen, setCallOpen] = useState(false);

  const [form] = Form.useForm();
  const inputRef = useRef(null);
  const messageListRef = useRef(null);

  useEffect(() => {
    antdMessage.config({ top: 72, duration: 3, maxCount: 1 });
  }, []);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    form.setFieldsValue({ message: e.target.value });
  };

  const handleOnSubmit = (eOrText) => {
    if (eOrText && typeof eOrText === "object" && "preventDefault" in eOrText) eOrText.preventDefault?.();
    const maybeText = typeof eOrText === "string" ? eOrText : undefined;
    const toSend = (maybeText ?? inputValue).trim();
    if (!toSend) return;

    addDocument("messages", {
      text: toSend,
      uid: sessionUid,
      photoURL: sessionPhoto,
      roomId: selectedRoom.id,
      displayName: sessionName,
      isRecalled: false,
      recalledAt: null,
      clientTime: Date.now(),
    });

    form.resetFields(["message"]);
    setInputValue("");
    inputRef.current?.focus?.(); inputRef.current?.input?.focus?.();
  };

  // Emoji
  const insertEmoji = (emoji, { autoSend = false } = {}) => {
    const ch = typeof emoji === "string" ? emoji : (emoji?.native ?? "");
    const el = inputRef.current?.input || inputRef.current?.resizableTextArea?.textArea || null;
    const current = inputValue || "";
    let next = current;

    if (el) {
      const start = el.selectionStart ?? current.length;
      const end   = el.selectionEnd ?? current.length;
      next = current.slice(0, start) + ch + current.slice(end);
      requestAnimationFrame(() => { try { el.focus(); const pos = start + ch.length; el.setSelectionRange?.(pos, pos); } catch {} });
    } else next = current + ch;

    setInputValue(next);
    form.setFieldsValue({ message: next });
    if (autoSend) handleOnSubmit(next);
  };

  const openEmojiPicker = () => {
    const rect = emojiBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setPickerPos({
        left: Math.max(8, Math.min(window.innerWidth - 360, rect.left)),
        bottom: Math.max(88, window.innerHeight - rect.top + 8),
      });
    }
    setOpenEmoji(v => !v);
  };

  useEffect(() => {
    const close = (e) => { if (emojiBtnRef.current && emojiBtnRef.current.contains(e.target)) return; };
    if (openEmoji) window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openEmoji]);

  // Firestore
  const condition = useMemo(
    () => ({ fieldName: "roomId", operator: "==", compareValue: selectedRoom.id }),
    [selectedRoom.id]
  );
  const messages = useFirestore("messages", condition);

  useEffect(() => {
    if (messageListRef?.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight + 50;
  }, [messages]);

  // ====== Media modal ======
  const openMedia = (kind) => {
    setMediaType(kind);
    setMediaModalOpen(true);
    setSelectedFile(null);
    setFileList([]);
    setPreviewUrl("");
    setSizeError("");
  };
  const closeMediaModal = () => {
    if (uploading) return;
    setMediaModalOpen(false);
    setSelectedFile(null);
    setFileList([]);
    setUploadPercent(0);
    setPreviewUrl("");
    setSizeError("");
  };

  const showOverLimit = (kindLabel, size, limit) => {
    const msg = `Dung lượng ${kindLabel} (${fmtBytes(size)}) vượt quá giới hạn cho phép (${fmtBytes(limit)}).`;
    setSizeError(msg);
    antdMessage.error(msg);
  };

  useEffect(() => {
    const raw = selectedFile;
    if (!raw) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(raw);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const isExtImage = (name='') => ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(name.split('.').pop()?.toLowerCase());
  const isExtVideo = (name='') => ['mp4','mov','webm','mkv','avi','m4v'].includes(name.split('.').pop()?.toLowerCase());

  const beforeUpload = (file) => {
    const type = file.type || "";
    const name = file.name || "";
    const isImg = type.startsWith("image/") || isExtImage(name);
    const isVid = type.startsWith("video/") || isExtVideo(name);

    if (mediaType === "image" && !isImg) { antdMessage.error("Chỉ chọn tệp ảnh"); return Upload.LIST_IGNORE; }
    if (mediaType === "video" && !isVid) { antdMessage.error("Chỉ chọn tệp video"); return Upload.LIST_IGNORE; }

    const limit = mediaType === "image" ? LIMIT_IMAGE : LIMIT_VIDEO;
    if (file.size > limit) {
      showOverLimit(mediaType === "image" ? "ảnh" : "video", file.size, limit);
      return Upload.LIST_IGNORE;
    }

    setSizeError("");
    setFileList([file]);
    setSelectedFile(file.originFileObj || file);
    return false;
  };

  const handleSelectFile = (info) => {
    const list = (info?.fileList || []).slice(-1);
    setFileList(list);

    const uf = info?.file;
    const raw = uf?.originFileObj;
    if (!raw) return;

    const type = raw.type || "";
    const name = raw.name || "";
    const isImg = type.startsWith("image/") || isExtImage(name);
    const isVid = type.startsWith("video/") || isExtVideo(name);
    if (mediaType === "image" && !isImg) return;
    if (mediaType === "video" && !isVid) return;

    const limit = mediaType === "image" ? LIMIT_IMAGE : LIMIT_VIDEO;
    if (raw.size > limit) {
      showOverLimit(mediaType === "image" ? "ảnh" : "video", raw.size, limit);
      setFileList([]);
      setSelectedFile(null);
      return;
    }

    setSizeError("");
    setSelectedFile(raw);
  };

  const handleUploadMedia = async () => {
    if (!selectedFile) { antdMessage.warning("Chưa chọn tệp"); return; }
    try {
      setUploading(true);
      setUploadPercent(30);

      const { url, publicId, resourceType } = await uploadToCloudinary(selectedFile, mediaType);
      setUploadPercent(90);

      const payload = {
        text: "",
        uid: sessionUid,
        photoURL: sessionPhoto,
        roomId: selectedRoom.id,
        displayName: sessionName,
        isRecalled: false,
        recalledAt: null,
        clientTime: Date.now(),
      };

      const isImage = (mediaType === "image") || resourceType === "image";
      if (isImage) {
        payload.imageUrl = url;
        payload.imagePublicId = publicId;
        payload.imageName = selectedFile.name;
      } else {
        payload.videoUrl = url;
        payload.videoPublicId = publicId;
        payload.videoName = selectedFile.name;
      }

      await addDocument("messages", payload);

      setUploadPercent(100);
      antdMessage.success(`Đã gửi ${isImage ? "ảnh" : "video"}`);
      closeMediaModal();
    } catch (err) {
      console.error(err);
      antdMessage.error(`Lỗi upload: ${err.message || "không xác định"}`);
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  // ===== Hành động nhóm: rời nhóm / kick / xem thành viên =====
  const leaveRoom = async () => {
    if (!selectedRoom?.id || !sessionUid) return;
    if (isOwner) {
      Modal.warning({
        title: "Bạn là chủ phòng",
        content: "Hãy chuyển quyền/chỉ định chủ khác trước khi rời nhóm.",
      });
      return;
    }
    Modal.confirm({
      title: "Rời nhóm?",
      content: `Bạn sẽ rời phòng "${selectedRoom?.name}"`,
      okText: "Rời nhóm",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await firebase
            .firestore()
            .collection("rooms")
            .doc(selectedRoom.id)
            .update({
              members: firebase.firestore.FieldValue.arrayRemove(sessionUid),
            });
          antdMessage.success("Đã rời nhóm");
          setSelectedRoomId?.("");
        } catch (e) {
          console.error(e);
          antdMessage.error(e?.message || "Không rời nhóm được");
        }
      },
    });
  };

  const kickMember = async (uid, name) => {
    if (!isOwner || !uid || uid === ownerUid) return;
    Modal.confirm({
      title: `Loại ${name || "thành viên"} khỏi nhóm?`,
      okText: "Loại khỏi nhóm",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await firebase
            .firestore()
            .collection("rooms")
            .doc(selectedRoom.id)
            .update({
              members: firebase.firestore.FieldValue.arrayRemove(uid),
            });
          antdMessage.success(`Đã loại ${name || "thành viên"}`);
        } catch (e) {
          console.error(e);
          antdMessage.error(e?.message || "Không thể loại thành viên");
        }
      },
    });
  };

  // Menu đính kèm (ảnh / video)
  const attachMenu = {
    items: [
      { key:"image", label:(<Space><PictureOutlined/> Ảnh</Space>) },
      { key:"video", label:(<Space><VideoCameraOutlined/> Video</Space>) },
    ],
    onClick: ({ key }) => openMedia(key),
  };

  return (
    <WrapperStyled>
      {selectedRoom.id ? (
        <>
          <div style={{ backgroundColor:"black", paddingLeft:"5px", paddingRight:"5px" }}>
            <HeaderStyled>
              <div className="header__info">
                <p className="header__title">{selectedRoom.name}</p>
                <span className="header__description">{selectedRoom.description}</span>
                {ownerUid && (
                  <span style={{ fontSize:12, color:"#666" }}>
                    Chủ phòng: {ownerUid === sessionUid ? "Bạn" : ownerUid}
                  </span>
                )}
              </div>

              <ButtonGroupStyled>
                <Button icon={<PhoneOutlined />} type="text" onClick={() => setCallOpen(true)}>Call</Button>
                <Button icon={<UserAddOutlined />} type="text" onClick={() => setIsInviteMemberVisible(true)}>Mời</Button>

                {/* Xem thành viên */}
                <Button type="text" onClick={() => setMembersOpen(true)}>Thành viên</Button>

                {/* Rời nhóm */}
                <Tooltip title={isOwner ? "Bạn là chủ phòng, không thể rời trực tiếp" : "Rời nhóm"}>
                  <Button type="text" danger onClick={leaveRoom} disabled={isOwner}>
                    Rời nhóm
                  </Button>
                </Tooltip>

                <Avatar.Group size="small" max={{ count: 2 }}>
                  {members.map(member => (
                    <Tooltip title={member.displayName} key={member.id || member.uid}>
                      <Avatar src={member.photoURL}>
                        {member.photoURL ? "" : member.displayName?.charAt(0)?.toUpperCase()}
                      </Avatar>
                    </Tooltip>
                  ))}
                </Avatar.Group>
              </ButtonGroupStyled>
            </HeaderStyled>

            <ContentStyled style={{ backgroundColor:"white", borderRadius:"10px" }}>
              <MessageListStyled ref={messageListRef}>
                {messages.map(mes => (
                  <Message
                    key={mes.id}
                    id={mes.id}
                    text={mes.text}
                    photoURL={mes.photoURL}
                    displayName={mes.displayName}
                    createdAt={mes.createdAt}
                    clientTime={mes.clientTime}
                    isOwnMessage={mes.uid === sessionUid}
                    isRecalled={!!mes.isRecalled}
                    imageUrl={mes.imageUrl}
                    imageName={mes.imageName}
                    imagePublicId={mes.imagePublicId}
                    videoUrl={mes.videoUrl}
                    videoName={mes.videoName}
                    videoPublicId={mes.videoPublicId}
                  />
                ))}
              </MessageListStyled>

              <FormStyled form={form}>
                <Button ref={emojiBtnRef} type="text" onClick={openEmojiPicker} aria-label="Insert emoji">😊</Button>

                <Dropdown menu={attachMenu} placement="topLeft" trigger={["click"]}>
                  <Button type="text" icon={<PaperClipOutlined />} aria-label="Attachment" />
                </Dropdown>

                <FormItem name="message" style={{ flex:1, marginBottom:0 }}>
                  <Input
                    ref={inputRef}
                    variant={false}
                    autoComplete="off"
                    placeholder="Aa"
                    value={inputValue}
                    onChange={handleInputChange}
                    onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleOnSubmit(); } }}
                  />
                </FormItem>

                <Button type="primary" onClick={() => handleOnSubmit()}>Gửi</Button>
              </FormStyled>

              {/* Popup gửi media */}
              <Modal
                title={`Gửi ${mediaType === "image" ? "ảnh" : "video"}`}
                open={mediaModalOpen}
                onCancel={closeMediaModal}
                destroyOnHidden
                maskClosable={!uploading}
                footer={[
                  <Button key="cancel" onClick={closeMediaModal} disabled={uploading}>Hủy</Button>,
                  <Button
                    key="ok" type="primary"
                    onClick={handleUploadMedia}
                    disabled={!selectedFile || uploading || !!sizeError}
                    loading={uploading}
                  >
                    Gửi
                  </Button>,
                ]}
              >
                <Upload.Dragger
                  accept={mediaType === "image" ? "image/*" : "video/*"}
                  multiple={false}
                  maxCount={1}
                  beforeUpload={beforeUpload}
                  onChange={handleSelectFile}
                  fileList={fileList}
                  showUploadList={{ showRemoveIcon: !uploading }}
                  onRemove={() => { setSelectedFile(null); setFileList([]); setPreviewUrl(""); setSizeError(""); }}
                  onDrop={(e) => {
                    const f = e.dataTransfer?.files?.[0];
                    if (!f) return;
                    const limit = mediaType === "image" ? LIMIT_IMAGE : LIMIT_VIDEO;
                    if (f.size > limit) {
                      showOverLimit(mediaType === "image" ? "ảnh" : "video", f.size, limit);
                    }
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    {mediaType === "image" ? <PictureOutlined/> : <VideoCameraOutlined/>}
                  </p>
                  <p className="ant-upload-text">
                    Kéo & thả {mediaType === "image" ? "ảnh" : "video"} vào đây, hoặc bấm để chọn
                  </p>
                  <p className="ant-upload-hint">
                    {mediaType === "image"
                      ? `Tối đa ${fmtBytes(LIMIT_IMAGE)}.`
                      : `Tối đa ${fmtBytes(LIMIT_VIDEO)}.`}
                  </p>
                </Upload.Dragger>

                {sizeError && (
                  <div style={{ marginTop: 12 }}>
                    <Alert type="error" showIcon message={sizeError} />
                  </div>
                )}

                {previewUrl && !uploading && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>
                      {selectedFile?.name}
                    </div>
                    {mediaType === "image" ? (
                      <img src={previewUrl} alt="preview" style={{ maxWidth:"100%", borderRadius:8, display:"block" }} />
                    ) : (
                      <video controls src={previewUrl} style={{ width:"100%", borderRadius:8, display:"block" }} />
                    )}
                  </div>
                )}

                {uploading && (
                  <Progress percent={uploadPercent} size="small" style={{ marginTop: 12 }} />
                )}
              </Modal>

              <EmojiPortal
                open={openEmoji}
                pos={pickerPos}
                onPick={(e) => { insertEmoji(e); }}
                onClose={() => setOpenEmoji(false)}
              />

              <CallModal
                open={callOpen}
                onClose={() => setCallOpen(false)}
                me={{ uid: sessionUid, displayName: sessionName }}
                roomId={selectedRoom.id}
              />

            </ContentStyled>
          </div>

          {/* Modal: Danh sách thành viên */}
          <Modal
            title={`Thành viên (${members.length})`}
            open={membersOpen}
            onCancel={() => setMembersOpen(false)}
            footer={null}
          >
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {members.map((m) => {
                const isMe = m.uid === sessionUid || m.id === sessionUid;
                const canKick = isOwner && !isMe;
                return (
                  <div key={m.id || m.uid} style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    border:"1px solid #eee", padding:"6px 10px", borderRadius:8
                  }}>
                    <Space>
                      <Avatar size="small" src={m.photoURL}>
                        {m.photoURL ? "" : m.displayName?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.displayName || m.uid}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>{m.email || m.uid}</div>
                      </div>
                    </Space>

                    {ownerUid && (m.uid === ownerUid) && (
                      <span style={{ fontSize: 12, color: "#1677ff" }}>Chủ phòng</span>
                    )}

                    {canKick && (
                      <Button danger size="small" onClick={() => kickMember(m.uid, m.displayName)}>
                        Kick
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Modal>
        </>
      ) : (
        <Alert message="Chọn phòng để được chat" type="info" showIcon style={{ margin: 5 }} closable />
      )}
    </WrapperStyled>
  );
}
