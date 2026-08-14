package ingest

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"strconv"

	"github.com/o8x/talk-mirror/internal/model"
	"github.com/o8x/talk-mirror/internal/session"
	"github.com/o8x/talk-mirror/internal/state"
)

// Server accepts raw TCP/UDP debug data on the same port.
type Server struct {
	host    string
	port    int
	mgr     *session.Manager
	gate    *state.Gate
	log     *slog.Logger
	tcpLn   net.Listener
	udpConn *net.UDPConn
}

func New(host string, port int, mgr *session.Manager, gate *state.Gate, log *slog.Logger) *Server {
	return &Server{host: host, port: port, mgr: mgr, gate: gate, log: log}
}

func (s *Server) addr() string { return net.JoinHostPort(s.host, strconv.Itoa(s.port)) }

// Start binds and begins serving TCP and UDP on the configured address.
func (s *Server) Start() error {
	tcpLn, err := net.Listen("tcp", s.addr())
	if err != nil {
		return err
	}
	s.tcpLn = tcpLn

	udpAddr, err := net.ResolveUDPAddr("udp", s.addr())
	if err != nil {
		_ = tcpLn.Close()
		return err
	}
	udpConn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		_ = tcpLn.Close()
		return err
	}
	s.udpConn = udpConn

	s.log.Info("data listener started", "tcp", s.addr(), "udp", s.addr())
	go s.acceptLoop()
	go s.udpLoop()
	return nil
}

func (s *Server) Close() {
	if s.tcpLn != nil {
		_ = s.tcpLn.Close()
	}
	if s.udpConn != nil {
		_ = s.udpConn.Close()
	}
}

func (s *Server) acceptLoop() {
	for {
		conn, err := s.tcpLn.Accept()
		if err != nil {
			return
		}
		go s.handleTCP(conn)
	}
}

func (s *Server) handleTCP(conn net.Conn) {
	defer conn.Close()

	ip, port := remote(conn.RemoteAddr())
	s.log.Info("tcp connection opened", "ip", ip, "port", port)
	defer func() {
		s.mgr.Close(ip, port, model.ProtocolTCP)
		s.log.Info("tcp connection closed", "ip", ip, "port", port)
	}()

	for {
		frame, err := readFrame(conn)
		if err != nil {
			return
		}
		if s.gate.Paused() {
			continue
		}
		var in model.Incoming
		if err := json.Unmarshal(frame, &in); err != nil {
			s.log.Warn("invalid json frame", "ip", ip, "port", port, "error", err)
			continue
		}
		s.mgr.Handle(ip, port, model.ProtocolTCP, in)
	}
}

func (s *Server) udpLoop() {
	buf := make([]byte, 65536)
	for {
		n, addr, err := s.udpConn.ReadFromUDP(buf)
		if err != nil {
			return
		}
		if s.gate.Paused() {
			continue
		}
		ip := addr.IP.String()
		port := addr.Port

		frame := buf[:n]
		if len(frame) >= 2 {
			if declared := binary.BigEndian.Uint16(frame[:2]); declared == uint16(len(frame)-2) {
				frame = frame[2:]
			}
		}

		var in model.Incoming
		if err := json.Unmarshal(frame, &in); err != nil {
			s.log.Warn("invalid udp datagram", "ip", ip, "port", port, "error", err)
			continue
		}
		s.mgr.Handle(ip, port, model.ProtocolUDP, in)
	}
}

// readFrame reads a single |2-byte big-endian uint16 length|payload| frame.
func readFrame(r io.Reader) ([]byte, error) {
	var lenBuf [2]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint16(lenBuf[:])
	frame := make([]byte, n)
	if _, err := io.ReadFull(r, frame); err != nil {
		return nil, err
	}
	return frame, nil
}

func remote(addr net.Addr) (string, int) {
	if ta, ok := addr.(*net.TCPAddr); ok {
		return ta.IP.String(), ta.Port
	}
	if ua, ok := addr.(*net.UDPAddr); ok {
		return ua.IP.String(), ua.Port
	}
	host, portStr, _ := net.SplitHostPort(addr.String())
	p, _ := strconv.Atoi(portStr)
	return host, p
}
