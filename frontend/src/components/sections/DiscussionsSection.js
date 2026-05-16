import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { discussionsService } from "../../services/discussionsService";
import TimedLoadingState from "../common/TimedLoadingState";
import { formatNepalDateTime } from "../../utils/dateTime";

const POLL_INTERVAL_MS = 5000;
const AUTO_SCROLL_THRESHOLD_PX = 72;

export default function DiscussionsSection({ branch = "Civil Engineering", isActive = false }) {
  const { user, isAdmin } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [creatingClassroom, setCreatingClassroom] = useState(false);
  const [newClassroomName, setNewClassroomName] = useState("");
  const [newClassroomDescription, setNewClassroomDescription] = useState("");
  const [deletingClassroomId, setDeletingClassroomId] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const lastMessageIdRef = useRef(0);
  const chatBodyRef = useRef(null);
  const shouldAutoScrollRef = useRef(false);

  const selectedClassroom = useMemo(
    () => classrooms.find((item) => Number(item.id) === Number(selectedClassroomId)) || null,
    [classrooms, selectedClassroomId]
  );

  const scrollToBottom = () => {
    const node = chatBodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  };

  const isNearBottom = () => {
    const node = chatBodyRef.current;
    if (!node) return true;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    return remaining <= AUTO_SCROLL_THRESHOLD_PX;
  };

  const updateLastMessageId = (value) => {
    lastMessageIdRef.current = Number(value || 0);
  };

  const loadClassrooms = async () => {
    setLoadingClassrooms(true);
    try {
      const rows = await discussionsService.listClassrooms(branch);
      const list = Array.isArray(rows) ? rows : [];
      setClassrooms(list);
      if (!list.length) {
        setSelectedClassroomId(null);
        setMessages([]);
        updateLastMessageId(0);
        return;
      }
      setSelectedClassroomId((current) => {
        const hasCurrent = list.some((item) => Number(item.id) === Number(current));
        if (hasCurrent) return current;
        return null;
      });
    } catch (error) {
      toast.error(error?.response?.data?.error || "Failed to load classrooms.");
      setClassrooms([]);
      setSelectedClassroomId(null);
      setMessages([]);
      updateLastMessageId(0);
    } finally {
      setLoadingClassrooms(false);
    }
  };

  const loadMessages = async (classroomId, reset = false) => {
    if (!classroomId) return;
    if (reset) {
      setLoadingMessages(true);
    }
    try {
      const sinceId = reset ? 0 : Number(lastMessageIdRef.current || 0);
      const payload = await discussionsService.listMessages(classroomId, sinceId, 140);
      const incoming = Array.isArray(payload?.messages) ? payload.messages : [];
      updateLastMessageId(Math.max(Number(lastMessageIdRef.current || 0), Number(payload?.last_message_id || 0)));
      if (reset) {
        setMessages(incoming);
        shouldAutoScrollRef.current = true;
        return;
      }
      if (!incoming.length) return;
      const keepPinnedToBottom = isNearBottom();
      setMessages((previous) => {
        const known = new Set(previous.map((item) => Number(item.id)));
        const nextRows = [...previous];
        incoming.forEach((row) => {
          if (known.has(Number(row.id))) return;
          nextRows.push(row);
        });
        return nextRows;
      });
      if (keepPinnedToBottom) {
        shouldAutoScrollRef.current = true;
      }
    } catch (_error) {
      if (reset) {
        toast.error("Unable to load discussion messages.");
      }
    } finally {
      if (reset) {
        setLoadingMessages(false);
      }
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadClassrooms().catch(() => {});
  }, [isActive, branch]);

  useEffect(() => {
    if (!isActive || !selectedClassroomId) return;
    loadMessages(selectedClassroomId, true).catch(() => {});
  }, [isActive, selectedClassroomId]);

  useEffect(() => {
    if (!isActive || !selectedClassroomId) return () => {};
    const timer = window.setInterval(() => {
      loadMessages(selectedClassroomId, false).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isActive, selectedClassroomId]);

  useEffect(() => {
    if (!isActive || !selectedClassroomId) return;
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
      shouldAutoScrollRef.current = false;
    }
  }, [messages, isActive]);

  useEffect(() => {
    if (selectedClassroomId) return;
    setMessages([]);
    updateLastMessageId(0);
  }, [selectedClassroomId]);

  const handleSend = async () => {
    const classroomId = Number(selectedClassroomId || 0);
    if (!classroomId) {
      toast.error("Select a classroom first.");
      return;
    }
    if (sendingMessage) return;
    const raw = String(messageText || "").trim();
    if (!raw) return;
    const text = raw.slice(0, 1000);
    setSendingMessage(true);
    try {
      const created = await discussionsService.sendMessage(classroomId, text);
      setMessages((previous) => [...previous, created]);
      updateLastMessageId(Math.max(Number(lastMessageIdRef.current || 0), Number(created?.id || 0)));
      shouldAutoScrollRef.current = true;
      setMessageText("");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Message failed to send.");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCreateClassroom = async () => {
    const name = String(newClassroomName || "").trim();
    if (!name || creatingClassroom) {
      return;
    }
    setCreatingClassroom(true);
    try {
      await discussionsService.createClassroom({
        branch,
        name,
        description: String(newClassroomDescription || "").trim(),
      });
      toast.success("Classroom created.");
      setNewClassroomName("");
      setNewClassroomDescription("");
      await loadClassrooms();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to create classroom.");
    } finally {
      setCreatingClassroom(false);
    }
  };

  const handleDeleteClassroom = async (classroomId) => {
    if (!isAdmin || deletingClassroomId) return;
    setDeletingClassroomId(classroomId);
    try {
      await discussionsService.deleteClassroom(classroomId);
      toast.success("Classroom deleted.");
      await loadClassrooms();
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to delete classroom.");
    } finally {
      setDeletingClassroomId(null);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!isAdmin || deletingMessageId) return;
    setDeletingMessageId(messageId);
    try {
      await discussionsService.deleteMessage(messageId);
      setMessages((previous) => previous.filter((row) => Number(row.id) !== Number(messageId)));
      toast.success("Message deleted.");
    } catch (error) {
      toast.error(error?.response?.data?.error || "Unable to delete message.");
    } finally {
      setDeletingMessageId(null);
    }
  };

  return (
    <section id="discussions" className={`section discussions-section ${isActive ? "active" : ""}`}>
      <h2 className="section-title">
        <i className="fas fa-comments"></i> Discussions
        <span className="field-indicator">
          <i className="fas fa-building"></i> {branch}
        </span>
      </h2>
      <p>Choose a classroom and discuss live in text-only group chat.</p>

      {isAdmin ? (
        <div className="discussion-admin-panel">
          <input
            type="text"
            placeholder="New classroom name (e.g., PSC, M.Sc., NEA Entrance)"
            value={newClassroomName}
            onChange={(event) => setNewClassroomName(event.target.value)}
          />
          <input
            type="text"
            placeholder="Short description (optional)"
            value={newClassroomDescription}
            onChange={(event) => setNewClassroomDescription(event.target.value)}
          />
          <button className="btn btn-secondary" type="button" onClick={handleCreateClassroom} disabled={creatingClassroom}>
            {creatingClassroom ? "Creating..." : "Add Classroom"}
          </button>
        </div>
      ) : null}

      {loadingClassrooms ? (
        <TimedLoadingState baseMessage="Loading discussion classrooms..." />
      ) : classrooms.length === 0 ? (
        <div className="empty-state">
          <i className="fas fa-inbox"></i>
          <h4>No classroom available yet for this field.</h4>
        </div>
      ) : (
        <div className="discussion-shell">
          <aside className="discussion-room-list">
            {classrooms.map((room) => {
              const isActiveRoom = Number(selectedClassroomId) === Number(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  className={`discussion-room-item ${isActiveRoom ? "active" : ""}`}
                  onClick={() => {
                    shouldAutoScrollRef.current = true;
                    setSelectedClassroomId(room.id);
                  }}
                >
                  <div className="discussion-room-meta">
                    <strong>{room.name}</strong>
                    <span>{room.description || "Classroom"}</span>
                  </div>
                  {isAdmin ? (
                    <span
                      className="discussion-room-delete"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleDeleteClassroom(room.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDeleteClassroom(room.id);
                        }
                      }}
                    >
                      {deletingClassroomId === room.id ? "..." : "x"}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </aside>

          <div className="discussion-chat-pane">
            <header className="discussion-chat-head">
              <h3>{selectedClassroom?.name || "Classroom"}</h3>
              <p>
                {selectedClassroom
                  ? (selectedClassroom.description || "Live text discussion")
                  : "Select a classroom first to view discussion messages."}
              </p>
            </header>

            <div className="discussion-chat-body" ref={chatBodyRef}>
              {!selectedClassroomId ? (
                <div className="discussion-empty-chat">Select a classroom from the left to load messages.</div>
              ) : loadingMessages ? (
                <TimedLoadingState baseMessage="Loading messages..." />
              ) : messages.length === 0 ? (
                <div className="discussion-empty-chat">Start the conversation.</div>
              ) : (
                messages.map((message) => {
                  const mine = Number(message.sender) === Number(user?.id);
                  return (
                    <article
                      key={message.id}
                      className={`discussion-message-bubble ${mine ? "mine" : "theirs"}`}
                    >
                      <div className="discussion-message-author">
                        {message.sender_name}
                        {message.is_admin_sender ? <span>Admin</span> : null}
                      </div>
                      <p>{message.text}</p>
                      <div className="discussion-message-foot">
                        <small>{formatNepalDateTime(message.created_at)}</small>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="discussion-message-delete"
                            onClick={() => handleDeleteMessage(message.id)}
                            disabled={deletingMessageId === message.id}
                          >
                            {deletingMessageId === message.id ? "..." : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <footer className="discussion-chat-input">
              <input
                type="text"
                placeholder={selectedClassroomId ? "Type your message..." : "Select a classroom first"}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                maxLength={1000}
                disabled={!selectedClassroomId}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!selectedClassroomId || sendingMessage || !String(messageText || "").trim()}
              >
                {sendingMessage ? "Sending..." : "Send"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
