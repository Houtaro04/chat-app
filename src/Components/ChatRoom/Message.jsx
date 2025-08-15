import { Avatar, Typography, Dropdown, Image } from "antd";
import { format } from 'date-fns';
import React from "react";
import styled from "styled-components";
import { MoreOutlined, UndoOutlined, UserOutlined } from "@ant-design/icons";
import firebase from "firebase/compat/app";
import { db } from "../../firebase/config";

const AVATAR = 32;
const GAP = 8;

const WrapperStyled = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  width: 100%;
  align-items: flex-start;
  ${(p) => p.$isOwn && `align-items: flex-end;`}

  .name-box {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
    ${(p) => (p.$isOwn ? `text-align: right;` : `text-align: left;`)}
  }

  .content-box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    ${(p) => p.$isOwn && `flex-direction: row-reverse;`}
  }

  .avatar {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
  }

  .message-content {
    display: inline-block;
    padding: 8px 12px;
    border-radius: 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    word-break: break-word;
    white-space: pre-wrap;
    ${(p) =>
      p.$isOwn
        ? `background:#e89fc6ff; border-bottom-right-radius:0;`
        : `background:#f1f0f0; border-bottom-left-radius:0;`}
  }

  .message-content.has-image {
    padding: 4px;
    background: transparent;
    box-shadow: none;
    border-radius: 12px;
  }

  .message-content.recalled {
    background: #e5e7eb;
    color: #6b7280;
    font-style: italic;
    border-bottom-right-radius: 14px;
    border-bottom-left-radius: 14px;
  }

  .time-box {
    font-size: 11px;
    color: #a7a7a7;
    margin-top: 4px;
    ${(p) => (p.$isOwn ? `text-align:right;` : `text-align:left;`)}
  }
`;

function formatDate(createdAt, clientTime) {
  let date;
  if (createdAt?.toDate) date = createdAt.toDate();
  else if (typeof createdAt?.seconds === 'number') date = new Date(createdAt.seconds * 1000);
  else if (clientTime) date = new Date(clientTime);
  else return '';
  return format(date, ' dd/MM/yyyy - HH:mm');
}

export default function Message({
  id,
  text,
  imageUrl,        // 👈 ảnh
  imageName,
  displayName,
  createdAt,
  clientTime,
  photoURL,
  isOwnMessage,
  isRecalled = false,
  roomId,          // nếu bạn dùng subcollection, có thể truyền vào
}) {
  const initial = displayName?.charAt(0)?.toUpperCase() || "";
  const sidePad = AVATAR + GAP;

  const handleRecall = async () => {
    let ref = db.collection("messages").doc(id);
    if (roomId) {
      ref = db.collection("rooms").doc(roomId).collection("messages").doc(id);
    }
    await ref.set(
      {
        isRecalled: true,
        text: "",
        imageUrl: "", // ẩn ảnh khi đã thu hồi
        recalledAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  };

  const menuItems = [{ key: "recall", icon: <UndoOutlined />, label: "Thu hồi tin nhắn" }];

  const contentClass =
    (isRecalled && "message-content recalled") ||
    (imageUrl ? "message-content has-image" : "message-content");

  return (
    <WrapperStyled $isOwn={isOwnMessage}>
      {!isOwnMessage && (
        <div
          className="name-box"
          style={{ paddingLeft: sidePad, lineHeight: 1, fontWeight: 600, marginBottom: 4 }}
          title={displayName}
        >
          <Typography.Text strong style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {displayName}
          </Typography.Text>
        </div>
      )}

      <div className="content-box">
        <Avatar className="avatar" size={AVATAR} src={photoURL} icon={!photoURL && <UserOutlined />}>
          {!photoURL && initial}
        </Avatar>

        <div className={contentClass}>
          {isRecalled ? (
            "Tin nhắn đã được thu hồi"
          ) : imageUrl ? (
            <Image
              src={imageUrl}
              alt={imageName || "image"}
              width={220}
              style={{ display: "block", borderRadius: 12 }}
            />
          ) : (
            text
          )}
        </div>

        {isOwnMessage && !isRecalled && (
          <Dropdown
            trigger={["click"]}
            placement={isOwnMessage ? "bottomRight" : "bottomLeft"}
            menu={{ items: menuItems, onClick: ({ key }) => key === "recall" && handleRecall() }}
          >
            <span style={{ cursor: "pointer", padding: "0 4px" }}>
              <MoreOutlined />
            </span>
          </Dropdown>
        )}
      </div>

      <div className="time-box">{formatDate(createdAt, clientTime)}</div>
    </WrapperStyled>
  );
}
