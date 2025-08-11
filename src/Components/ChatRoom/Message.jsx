import { Avatar, Typography } from "antd";
import { formatRelative } from "date-fns/fp";
import React from "react";
import styled from "styled-components";

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
        ? `background:#9fe8a3; border-bottom-right-radius:0;`
        : `background:#f1f0f0; border-bottom-left-radius:0;`}
  }

  .time-box {
    font-size: 11px;
    color: #a7a7a7;
    margin-top: 4px;
    ${(p) => (p.$isOwn ? `text-align:right;` : `text-align:left;`)}
  }
`;

function formatDate(seconds) {
  if (!seconds) return "";
  const s = formatRelative(new Date(seconds * 1000), new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Message({
  text,
  displayName,
  createdAt,
  photoURL,
  isOwnMessage,
}) {
  const initial = displayName?.charAt(0)?.toUpperCase() || "";
  const sidePad = AVATAR + GAP; // 40px

  return (
    <WrapperStyled $isOwn={isOwnMessage}>
      {/* Box 1: Tên – chỉ hiện với tin của người khác, và mép trùng bubble */}
      {!isOwnMessage && (
        <div
          className="name-box"
          style={{
            paddingLeft: sidePad,       // trùng mép bubble bên trái
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

      {/* Box 2: Avatar + Nội dung */}
      <div className="content-box">
        <Avatar className="avatar" size={AVATAR} src={photoURL}>
          {photoURL ? "" : initial}
        </Avatar>
        <div className="message-content">{text}</div>
      </div>

      {/* Box 3: Ngày/giờ */}
      <div className="time-box">{formatDate(createdAt?.seconds)}</div>
    </WrapperStyled>
  );
}
