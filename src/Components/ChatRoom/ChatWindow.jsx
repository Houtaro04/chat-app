import { UserAddOutlined, PictureOutlined } from "@ant-design/icons";
import { Alert, Avatar, Input, Tooltip, Button, Progress, Modal, Upload, message as antdMessage } from "antd";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import styled from "styled-components";
import FormItem from "antd/es/form/FormItem";
import Form from "antd/es/form/Form";
import Message from "./Message";
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
  display:flex;
  justify-content:space-between;
  height:60px;
  padding:0 16px;
  align-items:center;
  border-bottom:1px solid rgb(230,230,230);
  background:#ebe7e1;
  .header{
    &__info{display:flex; flex-direction:column; justify-content:center;}
    &__title{margin:0; font-weight:bold;}
    &__description{font-size:12px;}
  }
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

/* ===================== EMOJI (Virtualized Grid) ===================== */
const EMOJI_MAP = emojiData?.emojis ?? emojiData ?? {};
const toNative = (unified) => {
  if (typeof unified !== "string") return null;
  try {
    const cps = unified.split("-").map((u) => parseInt(u, 16));
    return String.fromCodePoint(...cps);
  } catch { return null; }
};
const EMOJIS = Object.values(EMOJI_MAP)
  .map((e) => toNative(e?.skins?.[0]?.unified ?? e?.unified ?? null))
  .filter(Boolean);

const EMOJI_COLS = 10;
const EMOJI_SIZE = 28;
const EMOJI_GAP  = 6;
const ROW_HEIGHT = EMOJI_SIZE + EMOJI_GAP;
const EMOJI_VISIBLE_ROWS = 10; // ~100 icon/lần
const OVERSCAN_ROWS = 3;
const EMOJI_PANEL_HEIGHT =
  EMOJI_VISIBLE_ROWS * EMOJI_SIZE + (EMOJI_VISIBLE_ROWS - 1) * EMOJI_GAP;

function VirtualEmojiGrid({ emojis, cols, size, gap, panelHeight, onPick }) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalRows = Math.ceil(emojis.length / cols);
  const totalHeight = Math.max(0, totalRows * (size + gap) - gap);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const endRow = Math.min(totalRows - 1, Math.floor((scrollTop + panelHeight) / ROW_HEIGHT) + OVERSCAN_ROWS);

  const startIndex = startRow * cols;
  const endIndex = Math.min(emojis.length, (endRow + 1) * cols);
  const slice = emojis.slice(startIndex, endIndex);

  const translateY = startRow * ROW_HEIGHT;

  return (
    <div ref={scrollRef} style={{ height: panelHeight, overflowY:"auto", paddingRight:4, WebkitOverflowScrolling:"touch" }}>
      <div style={{ height: totalHeight, position:"relative" }}>
        <div style={{ position:"absolute", top: translateY, left:0, right:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols}, ${size}px)`, gap:gap }}>
            {slice.map((ch, i) => (
              <button
                key={`${ch}-${startIndex + i}`}
                onClick={() => onPick(ch)}
                style={{ width:size, height:size, fontSize:20, lineHeight:`${size}px`, border:"none", background:"transparent", cursor:"pointer" }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Emoji popup (portal) */
function EmojiPortal({ open, pos, onPick, onClose }) {
  if (!open) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.left,
        bottom: pos.bottom,
        zIndex: 10050,
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 8,
        boxShadow: "0 8px 28px rgba(0,0,0,.18)",
        maxWidth: EMOJI_COLS * (EMOJI_SIZE + EMOJI_GAP) + 16,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Khung cuộn ~100 icon hiển thị mỗi lần */}
      <div
        style={{
          height: EMOJI_PANEL_HEIGHT,
          overflowY: "auto",
          paddingRight: 4,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${EMOJI_COLS}, ${EMOJI_SIZE}px)`,
            gap: EMOJI_GAP,
          }}
        >
          {EMOJIS.map((ch, i) => (
            <button
              key={`${ch}-${i}`}
              onClick={() => onPick(ch)}
              style={{
                width: EMOJI_SIZE,
                height: EMOJI_SIZE,
                fontSize: 20,
                lineHeight: `${EMOJI_SIZE}px`,
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "right", marginTop: 6 }}>
        <button onClick={onClose} style={{ fontSize: 12 }}>
          Đóng
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ===== Cloudinary unsigned upload (client) ===== */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Upload failed");
  return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height };
}

export default function ChatWindow() {
  const { selectedRoom, members, setIsInviteMemberVisible } = useContext(AppContext);
  const [user] = useAuthState(auth);
  const { user: { uid, photoURL, displayName } } = useContext(AuthContext);

  const [inputValue, setInputValue] = useState("");
  const [openEmoji, setOpenEmoji] = useState(false);
  const [pickerPos, setPickerPos] = useState({ left: 16, bottom: 120 });
  const emojiBtnRef = useRef(null);

  // Popup gửi ảnh
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const [form] = Form.useForm();
  const inputRef = useRef(null);
  const messageListRef = useRef(null);

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
      uid,
      photoURL,
      roomId: selectedRoom.id,
      displayName,
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
    let next = "";

    if (el) {
      const start = el.selectionStart ?? current.length;
      const end   = el.selectionEnd ?? current.length;
      next = current.slice(0, start) + ch + current.slice(end);
      requestAnimationFrame(() => { try { el.focus(); const pos = start + ch.length; el.setSelectionRange?.(pos, pos);} catch {} });
    } else {
      next = current + ch;
    }
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
    const close = (e) => { if (emojiBtnRef.current && emojiBtnRef.current.contains(e.target)) return; setOpenEmoji(false); };
    if (openEmoji) window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openEmoji]);

  // Firestore
  const condition = useMemo(() => ({ fieldName: "roomId", operator: "==", compareValue: selectedRoom.id }), [selectedRoom.id]);
  const messages = useFirestore("messages", condition);

  useEffect(() => {
    if (messageListRef?.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight + 50;
  }, [messages]);

  // ===== Popup gửi ảnh =====
  const openImageModal = () => setImageModalOpen(true);
  const closeImageModal = () => { if (uploading) return; setImageModalOpen(false); setSelectedFile(null); setUploadPercent(0); };

  const beforeUpload = (file) => {
    if (!file.type.startsWith("image/")) { antdMessage.error("Chỉ hỗ trợ hình ảnh"); return Upload.LIST_IGNORE; }
    const LIMIT = 5 * 1024 * 1024;
    if (file.size > LIMIT) { antdMessage.error("Ảnh quá lớn (tối đa 5MB)"); return Upload.LIST_IGNORE; }
    setSelectedFile(file);
    return false; // chặn upload tự động, để tự xử lý
  };

  const handleUploadImage = async () => {
    if (!selectedFile) { antdMessage.warning("Chưa chọn ảnh"); return; }
    try {
      setUploading(true);
      setUploadPercent(30); // progress giả định (Cloudinary fetch không báo tiến độ)
      const { url, publicId } = await uploadToCloudinary(selectedFile);
      setUploadPercent(90);

      await addDocument("messages", {
        text: "",
        imageUrl: url,
        imagePublicId: publicId,   // lưu để sau này muốn xoá thật thì có id
        imageName: selectedFile.name,
        uid,
        photoURL,
        roomId: selectedRoom.id,
        displayName,
        isRecalled: false,
        recalledAt: null,
        clientTime: Date.now(),
      });

      setUploadPercent(100);
      antdMessage.success("Đã gửi ảnh");
      closeImageModal();
    } catch (err) {
      console.error(err);
      antdMessage.error(err.message || "Gửi ảnh thất bại");
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
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
                  />
                ))}
              </MessageListStyled>

              <FormStyled form={form}>
                <Button ref={emojiBtnRef} type="text" onClick={openEmojiPicker} aria-label="Insert emoji">😊</Button>

                {/* Nút mở popup gửi ảnh */}
                <Button type="text" icon={<PictureOutlined />} onClick={openImageModal} aria-label="Send image" />

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

              {/* Popup gửi ảnh */}
              <Modal
                title="Gửi hình ảnh"
                open={imageModalOpen}
                onCancel={closeImageModal}
                okText={uploading ? "Đang gửi..." : "Gửi ảnh"}
                okButtonProps={{ disabled: !selectedFile || uploading, loading: uploading }}
                onOk={handleUploadImage}
                destroyOnHidden
              >
                <Upload.Dragger
                  accept="image/*"
                  multiple={false}
                  maxCount={1}
                  beforeUpload={beforeUpload}
                  showUploadList={{ showRemoveIcon: !uploading }}
                  onRemove={() => setSelectedFile(null)}
                >
                  <p className="ant-upload-drag-icon"><PictureOutlined /></p>
                  <p className="ant-upload-text">Kéo & thả ảnh vào đây, hoặc bấm để chọn</p>
                  <p className="ant-upload-hint">Hỗ trợ định dạng hình ảnh, tối đa 5MB.</p>
                </Upload.Dragger>

                {uploading && <Progress percent={uploadPercent} size="small" style={{ marginTop: 12 }} />}

                {selectedFile && !uploading && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>{selectedFile.name}</div>
                    <img
                      src={URL.createObjectURL(selectedFile)}
                      alt="preview"
                      style={{ maxWidth:"100%", borderRadius:8, display:"block" }}
                      onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                    />
                  </div>
                )}
              </Modal>

              <EmojiPortal
                open={openEmoji}
                pos={pickerPos}
                onPick={(e) => { insertEmoji(e); setOpenEmoji(false); }}
                onClose={() => setOpenEmoji(false)}
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
