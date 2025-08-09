import { UserAddOutlined } from "@ant-design/icons";
import { Alert, Avatar, Input, Tooltip } from "antd";
import React, { useContext, useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { Button } from "antd";
import FormItem from "antd/es/form/FormItem";
import Form from "antd/es/form/Form";
import Message from "./Message";
import { AppContext } from "../../Context/AppProvider";
import { AuthContext } from "../../Context/AuthProvider";
import { addDocument } from '../../firebase/services';
import useFirestore from "../../Hooks/useFirestore";



const WrapperStyled = styled.div`
    heitght: 100vh;

`;

const HeaderStyled = styled.div`
    display: flex;
    justify-content: space-between;
    height: 60px;
    padding: 0 16px;
    align-items: center;
    border-bottom: 1px solid rgba(230, 230, 230);
    background-color: #bcb88a;
    .header{
        &__info{
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        &__title{
            margin: 0;
            font-weight: bold;
        }
        &__description{
            font-size: 12px;
        }
    }
`;
const ButtonGroupStyled = styled.div`
    display: flex;
    align-items: center;
`;

const ContentStyled = styled.div`
    height: calc(100vh - 85px);
    display: flex;
    flex-direction: column;
    padding: 11px;
    justify-content: flex-end;
`;

const FormStyled = styled(Form)`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 2px 2px 0;
    border: 1px solid rgb(230, 230, 230);
    border-radius: 15px;

    .ant-form-item{
        flex: 1;
        margin-bottom: 0;
    }
`;

const MessageListStyled = styled.div`
    max-height: 100%;
    overflow-y: auto;
`;

export default function ChatWindow() {
    const { selectedRoom, members, setIsInviteMemberVisible } = useContext(AppContext)
    console.log("MEMBERS >>>", members);
    const {
        user: { uid, photoURL, displayName },
    } = useContext(AuthContext);
    const [inputValue, setInputValue] = useState('');
    const [form] = Form.useForm();
    const inputRef = useRef(null);
    const messageListRef = useRef(null);

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };

    const handleOnSubmit = () => {
        addDocument('messages', {
        text: inputValue,
        uid,
        photoURL,
        roomId: selectedRoom.id,
        displayName,
        });

        form.resetFields(['message']);

        // focus to input again after submit
        if (inputRef?.current) {
        setTimeout(() => {
            inputRef.current.focus();
        });
        }
    };

    const condition = React.useMemo(
        () => ({
        fieldName: 'roomId',
        operator: '==',
        compareValue: selectedRoom.id,
        }),
        [selectedRoom.id]
    );

    const messages = useFirestore('messages', condition);
    console.log('messages', messages);

    useEffect(() => {
        // scroll to bottom after message changed
        if (messageListRef?.current) {
        messageListRef.current.scrollTop =
            messageListRef.current.scrollHeight + 50;
        }
    }, [messages]);
    
    return (
        <WrapperStyled>
            {
                selectedRoom.id ? (
                    <>
                        <HeaderStyled>
                            <div className="header__info">
                                <p className="header__title">{selectedRoom.name}</p>
                                <span className="header__description">{selectedRoom.description}</span>
                            </div>
                            <ButtonGroupStyled>
                                <Button icon={<UserAddOutlined />} type='text' onClick={() => setIsInviteMemberVisible(true)}>Mời</Button>
                                    <Avatar.Group size='small' max={{ count: 2 }}>
                                        {members.map((member) => (
                                        <Tooltip title={member.displayName} key={member.id}>
                                            <Avatar src={member.photoURL}>
                                            {member.photoURL
                                                ? ''
                                                : member.displayName?.charAt(0)?.toUpperCase()}
                                            </Avatar>
                                        </Tooltip>
                                        ))}
                                    </Avatar.Group>
                            </ButtonGroupStyled>
                        </HeaderStyled>
                        <ContentStyled>
                            <MessageListStyled ref={messageListRef}>
                                {messages.map((mes) => (
                                    <Message 
                                        key={mes.id}
                                        text={mes.text}
                                        photoURL={mes.photoURL}
                                        displayName={mes.displayName}
                                        createdAt={mes.createdAt}
                                    />
                                ))}

                            </MessageListStyled>
                            <FormStyled form={form}>
                                <FormItem name='message'>
                                    <Input 
                                        ref={inputRef}
                                        variant={false} 
                                        autoComplete="off" 
                                        onChange={handleInputChange} 
                                        onPressEnter={handleOnSubmit} 
                                        placeholder="Aa" 
                                    />
                                </FormItem>
                                <Button type="primary" onClick={handleOnSubmit}>Gửi</Button>
                            </FormStyled>

                        </ContentStyled>
                    </>
                ) : <Alert message="Chọn phòng để được chat" type="info" showIcon style={{margin: 5}} closable />
            }
            
        </WrapperStyled>
    );
}