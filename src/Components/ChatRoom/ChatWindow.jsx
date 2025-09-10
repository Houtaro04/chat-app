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
import CallModal from "./CallModal";
import { AppContext } from "../../Context/AppProvider";
import { AuthContext } from "../../Context/AuthProvider";
import { addDocument } from "../../firebase/services";
import useFirestore from "../../Hooks/useFirestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../../firebase/config";
import { createPortal } from "react-dom";
import emojiData from "@emoji-mart/data";

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
  const { selectedRoom, members, setIsInviteMemberVisible } = useContext(AppContext);
  const [user] = useAuthState(auth);
  const { user: { uid, photoURL, displayName } } = useContext(AuthContext);

  const [inputValue, setInputValue] = useState("");
  const [openEmoji, setOpenEmoji] = useState(false);
  const [pickerPos, setPickerPos] = useState({ left: 16, bottom: 120 });
  const emojiBtnRef = useRef(null);

  // Popup media (ảnh/video)
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaType, setMediaType] = useState("image"); // 'image' | 'video'
  const [fileList, setFileList] = useState([]);        // Antd Upload list (UploadFile[])
  const [selectedFile, setSelectedFile] = useState(null); // File (origin)
  const [previewUrl, setPreviewUrl] = useState("");    // preview URL
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [sizeError, setSizeError] = useState("");       // ⬅️ Hiện lỗi trong modal
  const [callOpen, setCallOpen] = useState(false);


  const [form] = Form.useForm();
  const inputRef = useRef(null);
  const messageListRef = useRef(null);

  // đảm bảo toast không bị khuất
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
      text: toSend, uid, photoURL, roomId: selectedRoom.id, displayName,
      isRecalled: false, recalledAt: null, clientTime: Date.now(),
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
  const condition = useMemo(() => ({ fieldName: "roomId", operator: "==", compareValue: selectedRoom.id }), [selectedRoom.id]);
  const messages = useFirestore("messages", condition);

  useEffect(() => {
    if (messageListRef?.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight + 50;
  }, [messages]);

  // ====== Media modal ======
  const openMedia = (kind) => {
    setMediaType(kind);
    setMediaModalOpen(true);
    // reset khi mở
    setSelectedFile(null);
    setFileList([]);
    setPreviewUrl("");
    setSizeError(""); // reset lỗi
  };
  const closeMediaModal = () => {
    if (uploading) return;
    setMediaModalOpen(false);
    setSelectedFile(null);
    setFileList([]);
    setUploadPercent(0);
    setPreviewUrl("");
    setSizeError(""); // reset lỗi
  };

  // Hiển thị lỗi quá dung lượng (toast + alert trong modal)
  const showOverLimit = (kindLabel, size, limit) => {
    const msg = `Dung lượng ${kindLabel} (${fmtBytes(size)}) vượt quá giới hạn cho phép (${fmtBytes(limit)}).`;
    setSizeError(msg);
    antdMessage.error(msg);
  };

  // Preview URL theo file gốc (originFileObj)
  useEffect(() => {
    const raw = selectedFile;
    if (!raw) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(raw);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // kiểm tra ext (phòng khi type rỗng)
  const isExtImage = (name='') => ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(name.split('.').pop()?.toLowerCase());
  const isExtVideo = (name='') => ['mp4','mov','webm','mkv','avi','m4v'].includes(name.split('.').pop()?.toLowerCase());

  // Antd Upload: chặn auto upload, set list + validate size/type
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
    setFileList([file]); // giữ UploadFile trong list
    setSelectedFile(file.originFileObj || file); // file preview/upload
    return false; // không auto upload
  };

  // Bắt file khi change (kể cả kéo-thả)
  const handleSelectFile = (info) => {
    const list = (info?.fileList || []).slice(-1); // chỉ giữ 1 file
    setFileList(list);

    const uf = info?.file; // UploadFile
    const raw = uf?.originFileObj;
    if (!raw) return;

    // validate lại + cảnh báo dung lượng
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
        uid, photoURL, roomId: selectedRoom.id, displayName,
        isRecalled: false, recalledAt: null, clientTime: Date.now(),
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
              </div>
              <ButtonGroupStyled>
                <Button icon={<PhoneOutlined />} type="text" onClick={() => setCallOpen(true)}>Call</Button>
                <Button icon={<UserAddOutlined />} type="text" onClick={() => setIsInviteMemberVisible(true)}>Mời</Button>
                <Avatar.Group size="small" max={{ count: 2 }}>
                  {members.map(member => (
                    <Tooltip title={member.displayName} key={member.id}>
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
                    isOwnMessage={mes.uid === user?.uid}
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
                destroyOnClose
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

                {/* ALERT lỗi quá dung lượng trong modal */}
                {sizeError && (
                  <div style={{ marginTop: 12 }}>
                    <Alert type="error" showIcon message={sizeError} />
                  </div>
                )}

                {/* PREVIEW */}
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
                me={{ uid, displayName }}
                roomId={selectedRoom.id}
              />

            </ContentStyled>
          </div>
        </>
      ) : (
        <Alert message="Chọn phòng để được chat" type="info" showIcon style={{ margin: 5 }} closable />
      )}
    </WrapperStyled>
  );
}
