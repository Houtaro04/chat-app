import { Avatar, Typography, Dropdown } from "antd";
import { format } from "date-fns";
import React from "react";
import styled from "styled-components";
import { MoreOutlined, UndoOutlined } from "@ant-design/icons";
import firebase from "firebase/compat/app";
import { db } from "../../firebase/config"; // nhớ chỉnh đúng path nếu khác

const AVATAR = 32;
const GAP = 8;

const WrapperStyled = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  width: 100%;
  align-items: flex-start; /* người khác: trái */
  ${(p) => p.$isOwn && `align-items: flex-end;`} /* của mình: phải */

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
        ? `background: #e89fc6ff; border-bottom-right-radius:0;`
        : `background: #f1f0f0; border-bottom-left-radius:0;`}
  }

  /* trạng thái đã thu hồi */
  .message-content.recalled {
    background: #e5e7eb;
    color: #6b7280;
    font-style: italic;
    border-bottom-right-radius: 14px; /* bo lại cho đẹp */
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
  if (createdAt?.toDate) {
    date = createdAt.toDate(); // Firestore Timestamp
  } else if (typeof createdAt?.seconds === "number") {
    date = new Date(createdAt.seconds * 1000);
  } else if (clientTime) {
    date = new Date(clientTime); // fallback
  } else {
    return "";
  }
  return format(date, " dd/MM/yyyy - HH:mm");
}

export default function Message({
  id,                 // 👈 cần để update
  text,
  displayName,
  createdAt,
  clientTime,
  photoURL,
  isOwnMessage,
  isRecalled = false, // 👈 thêm prop này
  roomId,             // nếu bạn dùng sub-collection rooms/{roomId}/messages, truyền vào để update đúng path
}) {
  const initial = displayName?.charAt(0)?.toUpperCase() || "";
  const sidePad = AVATAR + GAP; // 40px

  // 👇 Thu hồi tin nhắn
  const handleRecall = async () => {
    let docRef = db.collection("messages").doc(id); // top-level

    // Nếu bạn lưu theo rooms/{roomId}/messages:
    if (roomId) {
      docRef = db
        .collection("rooms")
        .doc(roomId)
        .collection("messages")
        .doc(id);
    }

    await docRef.update({
      isRecalled: true,
      text: "",
      recalledAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  const menuItems = [
    { key: "recall", icon: <UndoOutlined />, label: "Thu hồi tin nhắn" },
  ];

  return (
    <WrapperStyled $isOwn={isOwnMessage}>
      {/* Box 1: Tên – chỉ hiện với tin của người khác */}
      {!isOwnMessage && (
        <div
          className="name-box"
          style={{
            paddingLeft: sidePad,
            paddingRight: 0,
            lineHeight: 1,
            fontWeight: 600,
            marginBottom: 4,
          }}
          title={displayName}
        >
          <Typography.Text strong style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {displayName}
          </Typography.Text>
        </div>
      )}

      {/* Box 2: Avatar + Nội dung (+ nút ...) */}
      <div className="content-box">
        <Avatar className="avatar" size={AVATAR} src={photoURL}>
          {photoURL ? "" : initial}
        </Avatar>

        <div className={`message-content ${isRecalled ? "recalled" : ""}`}>
          {isRecalled ? "Tin nhắn đã được thu hồi" : text}
        </div>

        {/* nút ... chỉ hiện với tin của mình & chưa thu hồi */}
        {isOwnMessage && !isRecalled && (
          <Dropdown
            trigger={["click"]}
            placement={isOwnMessage ? "bottomRight" : "bottomLeft"}
            menu={{
              items: menuItems,
              onClick: ({ key }) => key === "recall" && handleRecall(),
            }}
          >
            {/* trigger PHẢI là 1 phần tử */}
            <span style={{ cursor: "pointer", padding: "0 4px" }} aria-label="More">
              <MoreOutlined />
            </span>
          </Dropdown>
        )}
      </div>

      {/* Box 3: Ngày/giờ */}
      <div className="time-box">{formatDate(createdAt, clientTime)}</div>
    </WrapperStyled>
  );
}
