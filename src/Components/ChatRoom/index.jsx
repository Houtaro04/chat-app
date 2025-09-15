import React from "react";
import {Row, Col} from 'antd';
import ChatWindow from "./ChatWindow.jsx";
import SideBar from "./SideBar.jsx";
import { Navigate } from "react-router-dom";
import { auth } from "../../firebase/config.jsx";

export default function ChatRoom() {
  const jwt = JSON.parse(localStorage.getItem("jwt_auth") || "null");
  const isAuthed = !!jwt?.token || !!auth?.currentUser;

  if (!isAuthed) return <Navigate to="/login" replace />;  // +++ đá về login nếu chưa auth
  return (
        <Row>
          <Col span={6}>
            <SideBar />
          </Col>
          <Col span={18}>
            <ChatWindow />
          </Col>
        </Row>
  );
}