import logging
import collections

# Armazena os últimos 1000 logs em memória
log_history = collections.deque(maxlen=1000)

class MemoryLogHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            log_history.append(msg)
        except Exception:
            self.handleError(record)

# Configura o handler de memória para o root logger
memory_handler = MemoryLogHandler()
memory_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
logging.getLogger().addHandler(memory_handler)
