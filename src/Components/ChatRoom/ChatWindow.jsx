import { UserAddOutlined } from "@ant-design/icons";
import { Alert, Avatar, Input, Tooltip, Button } from "antd";
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

const WrapperStyled = styled.div`height:100vh;`;
const HeaderStyled = styled.div`
  display:flex; justify-content:space-between; height:60px; padding:0 16px;
  align-items:center; border-bottom:1px solid rgba(230,230,230); background:#bcb88a;
  .header{ &__info{display:flex; flex-direction:column; justify-content:center;}
    &__title{margin:0; font-weight:bold;} &__description{font-size:12px;} }
  border-radius: 10px;
`;
const ButtonGroupStyled = styled.div`display:flex; align-items:center;`;
const ContentStyled = styled.div`height:calc(100vh - 85px); display:flex; flex-direction:column; padding:11px; justify-content:flex-end;`;
const FormStyled = styled(Form)`
  display:flex; align-items:center; gap:8px; padding:2px 6px 2px 4px;
  border:1px solid rgb(230,230,230); border-radius:15px;
  .ant-form-item{flex:1; margin-bottom:0;}
`;
const MessageListStyled = styled.div`max-height:100%; overflow-y:auto;`;

/* Emoji popup (portal) */
const EMOJIS = ["😀","😃","😄","😁","😂","🙂","😉","😍","😘","😎","😢","😭","😡","👍","🙏","👏","🔥","💯","🤩","🥹","😅","😆","🤔","😴","🥲","🎉","✨","🤝","👌","🥳"];
function EmojiPortal({ open, pos, onPick, onClose }) {
  if (!open) return null;
  return createPortal(
    <div style={{
      position:"fixed", left:pos.left, bottom:pos.bottom, zIndex:10050,
      background:"#fff", border:"1px solid #eee", borderRadius:8, padding:8, boxShadow:"0 8px 28px rgba(0,0,0,.18)"
    }}
      onMouseDown={(e)=>e.preventDefault()}
    >
      <div style={{display:"grid", gridTemplateColumns:"repeat(10,28px)", gap:6}}>
        {EMOJIS.map(e=>(
          <button key={e} onClick={()=>onPick(e)}
            style={{width:28, height:28, fontSize:20, lineHeight:"28px", border:"none", background:"transparent", cursor:"pointer"}}>
            {e}
          </button>
        ))}
      </div>
      <div style={{textAlign:"right", marginTop:6}}>
        <button onClick={onClose} style={{fontSize:12}}>Đóng</button>
      </div>
    </div>, document.body
  );
}

export default function ChatWindow() {
    const { selectedRoom, members, setIsInviteMemberVisible } = useContext(AppContext);
    const [user] = useAuthState(auth);
    const { user: { uid, photoURL, displayName } } = useContext(AuthContext);

    const [inputValue, setInputValue] = useState("");
    const [openEmoji, setOpenEmoji] = useState(false);
    const [pickerPos, setPickerPos] = useState({ left: 16, bottom: 120 });
    const emojiBtnRef = useRef(null);

    const [form] = Form.useForm();
    const inputRef = useRef(null);
    const messageListRef = useRef(null);

    // ✅ Đồng bộ state <-> Form khi gõ
    const handleInputChange = (e) => {
        setInputValue(e.target.value);
        form.setFieldsValue({ message: e.target.value });
    };

    const handleOnSubmit = (eOrText) => {
    // nếu tham số là event => chặn mặc định và bỏ qua
        if (eOrText && typeof eOrText === 'object' && 'preventDefault' in eOrText) {
            eOrText.preventDefault?.();
        }

        const maybeText = typeof eOrText === 'string' ? eOrText : undefined;
        const toSend = (maybeText ?? inputValue).trim();   // luôn là string

        if (!toSend) return;

        addDocument('messages', {
            text: toSend,
            uid,
            photoURL,
            roomId: selectedRoom.id,
            displayName,
        });

        form.resetFields(['message']);
        setInputValue('');

        inputRef.current?.focus?.();
        inputRef.current?.input?.focus?.();
        };

    // ✅ Chèn emoji: cập nhật state + Form, đặt caret đúng chỗ
    const insertEmoji = (emoji, { autoSend = false } = {}) => {
        const ch = typeof emoji === "string" ? emoji : (emoji?.native ?? "");
        const el = inputRef.current?.input || inputRef.current?.resizableTextArea?.textArea || null;

        const current = inputValue || "";
        let next = "";

        if (el) {
        const start = el.selectionStart ?? current.length;
        const end   = el.selectionEnd ?? current.length;
        next = current.slice(0, start) + ch + current.slice(end);

        requestAnimationFrame(() => {
            try {
            el.focus();
            const pos = start + ch.length;
            el.setSelectionRange?.(pos, pos);
            } catch {}
        });
        } else {
            next = current + ch;
        }

        setInputValue(next);                 // state controlled
        form.setFieldsValue({ message: next }); // 🔥 đồng bộ Form

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
        const close = (e) => {
        if (emojiBtnRef.current && emojiBtnRef.current.contains(e.target)) return;
        setOpenEmoji(false);
        };
        if (openEmoji) window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [openEmoji]);

    const condition = useMemo(() => ({
        fieldName: "roomId", operator: "==", compareValue: selectedRoom.id
    }), [selectedRoom.id]);

    const messages = useFirestore("messages", condition);

    useEffect(() => {
        if (messageListRef?.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight + 50;
        }
    }, [messages]);

    return (
        <WrapperStyled>
        {selectedRoom.id ? (
            <>
                <div style={{backgroundColor: 'black', padding: '5px'}}>
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

                    <ContentStyled style={{backgroundColor: 'white', borderRadius: '10px'}}>
                        <MessageListStyled ref={messageListRef}>
                        {messages.map(mes => (
                            <Message
                            key={mes.id}
                            text={mes.text}
                            photoURL={mes.photoURL}
                            displayName={mes.displayName}
                            createdAt={mes.createdAt}
                            clientTime={mes.clientTime}     
                            isOwnMessage={mes.uid === user?.uid}
                            />
                        ))}
                        </MessageListStyled>

                        <FormStyled form={form}>
                        <Button
                            ref={emojiBtnRef}
                            type="text"
                            onClick={openEmojiPicker}
                            aria-label="Insert emoji"
                        >😊</Button>

                        <FormItem name="message" style={{ flex: 1, marginBottom: 0 }}>
                            <Input
                            ref={inputRef}
                            variant={false}
                            autoComplete="off"
                            placeholder="Aa"
                            value={inputValue}
                            onChange={handleInputChange}
                            onPressEnter={(e) => {
                                if (!e.shiftKey) { e.preventDefault(); handleOnSubmit(); }
                            }}
                            />
                        </FormItem>

                        <Button type="primary" onClick={() => handleOnSubmit()}>
                            Gửi
                        </Button>

                        </FormStyled>

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
