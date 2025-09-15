// src/Components/ChatRoom/UserInfor.jsx
import React, { useContext, useMemo } from "react";
import styled from "styled-components";
import { Dropdown, Avatar, Space, Typography } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { AuthContext } from "../../Context/AuthProvider";
import { auth } from "../../firebase/config";
import { useAuthState } from "react-firebase-hooks/auth";

const WrapperStyle = styled.div`
  display: flex;
  justify-content: flex-start;
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid rgba(82, 38, 83, 0.4);

  .username {
    color: white;
    margin-left: 5px;
  }
`;

export default function UserInfor() {
  // Firebase user (Google/Facebook)
  const [fbUser] = useAuthState(auth);
  // User từ Context (nếu bạn có set)
  const { user: ctxUser } = useContext(AuthContext) || {};

  // User từ JWT trong localStorage
  const jwtUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("jwt_auth") || "null")?.user || null;
    } catch {
      return null;
    }
  }, []);

  // Hợp nhất user: ưu tiên Context → Firebase → JWT
  const sessionUser = useMemo(() => {
    const u =
      ctxUser ||
      (fbUser && {
        uid: fbUser.uid,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
        email: fbUser.email,
      }) ||
      jwtUser;

    if (!u) return { uid: null, displayName: "User", photoURL: "" };

    return {
      uid: u.uid ?? u.id ?? u._id ?? u.username ?? null,
      displayName: u.displayName ?? u.username ?? "User",
      photoURL: u.photoURL ?? "",
    };
  }, [ctxUser, fbUser, jwtUser]);

  const initial = (sessionUser.displayName?.charAt(0) || "U").toUpperCase();

  const handleLogout = async () => {
    try {
      // Xóa session JWT nếu có
      localStorage.removeItem("jwt_auth");
      // Đăng xuất Firebase nếu đang signed-in
      await auth.signOut().catch(() => {});
    } finally {
      // Chuyển về /login
      window.location.href = "/login";
    }
  };

  const items = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
    },
  ];

  return (
    <WrapperStyle>
      <div>
        <Dropdown
          menu={{
            items,
            onClick: ({ key }) => key === "logout" && handleLogout(),
          }}
          trigger={["click"]}
          placement="bottomLeft"
        >
          <Space style={{ cursor: "pointer" }}>
            <Avatar src={sessionUser.photoURL || undefined} style={{ backgroundColor: "#1677ff"}}>{!sessionUser.photoURL && initial}</Avatar>
            <Typography.Text className="username">{sessionUser.displayName}</Typography.Text>
          </Space>
        </Dropdown>
      </div>
    </WrapperStyle>
  );
}
