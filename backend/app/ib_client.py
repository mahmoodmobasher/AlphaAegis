"""
AlphaAegis backend module for Interactive Brokers client. Provides async wrapper for IB API.
"""
import asyncio
import os
import threading
from ibapi.wrapper import EWrapper
from ibapi.client import EClient
from ibapi.common import TickAttrib
from ibapi.contract import Contract, ContractDetails

class IBClient(EWrapper, EClient):
    """Simple wrapper around the official Interactive Brokers API.
    It provides an async‑friendly interface for the handful of calls we need:
    - reqCurrentTime (handshake validation)
    - reqAccountSummary (fetch ledger information)
    The class stores the latest account summary in ``self.account_summary`` and
    signals when the data is ready via ``self.summary_event`` (an ``asyncio.Event``).
    """

    def __init__(self):
        EWrapper.__init__(self)
        EClient.__init__(self, wrapper=self)
        # Event set when a full account summary has been received
        self.summary_event = asyncio.Event()
        # Dictionary that will contain the ledger fields we request
        self.account_summary: dict = {}
        # Option chain storage
        self.option_chain: list = []
        self.option_chain_event = asyncio.Event()
        # Option definitions parameter storage
        self.opt_params: list = []
        self.opt_params_event = asyncio.Event()
        # Spot price storage
        self.last_spot_price: float = 0.0
        self.spot_event = asyncio.Event()
        # Positions storage
        self.positions: list = []
        self.positions_event = asyncio.Event()
        self.loop = None

    # ---------------------------------------------------------------------
    # EWrapper callbacks – only the ones we actually use
    # ---------------------------------------------------------------------
    def error(self, reqId: int, errorCode: int, errorString: str, advancedOrderRejectJson: str = ""):
        # Log errors; for a production app you would handle reconnects etc.
        print(f"IB error {reqId}: [{errorCode}] {errorString}")
        # Propagate error to asyncio if we are waiting for data
        if not self.summary_event.is_set():
            if self.loop:
                self.loop.call_soon_threadsafe(self.summary_event.set)
            else:
                self.summary_event.set()

    def currentTime(self, time: int):
        # This is called in response to reqCurrentTime – we do not need the value.
        # The mere receipt indicates the connection handshake succeeded.
        pass

    def accountSummary(self, reqId: int, account: str, tag: str, value: str, currency: str):
        """Collect each ledger line into ``self.account_summary``.
        The request we issue uses the $LEDGER group, which returns fields like
        "TotalCashValue", "NetLiquidation", "AvailableFunds", etc.
        """
        # Store values under their tag name; keep the raw string value for now.
        self.account_summary[tag] = {"value": value, "currency": currency}
        # IB sends a terminating ``accountSummaryEnd`` callback – we set the event then.

    def accountSummaryEnd(self, reqId: int):
        # Signal that the full summary has arrived.
        if self.loop:
            self.loop.call_soon_threadsafe(self.summary_event.set)
        else:
            self.summary_event.set()

    def position(self, account: str, contract: Contract, position: float, avgCost: float):
        """Collect each position detail from IB."""
        print(f"[IB CLIENT] position received: account={account}, symbol={contract.symbol}, qty={position}")
        self.positions.append({
            "account": account,
            "symbol": contract.symbol,
            "secType": contract.secType,
            "expiry": contract.lastTradeDateOrContractMonth,
            "strike": contract.strike,
            "right": contract.right,
            "multiplier": contract.multiplier,
            "position": position,
            "avgCost": avgCost,
            "localSymbol": contract.localSymbol
        })

    def positionEnd(self):
        """Signal that all positions have been received."""
        print(f"[IB CLIENT] positionEnd received, total={len(self.positions)}")
        if self.loop:
            self.loop.call_soon_threadsafe(self.positions_event.set)
        else:
            self.positions_event.set()

    # ---------------------------------------------------------------------
    # Helper methods – synchronous API, wrapped for async callers
    # ---------------------------------------------------------------------
    async def connect_async(self, host: str, port: int, client_id: int, timeout: int = 5):
        """Connect to the TWS/IB Gateway and wait until the socket is ready.
        ``EClient.connect`` is blocking only for the initial socket creation, so we
        simply call it, start the background reader thread to process messages, and
        then sleep a short period to allow the connection to settle.
        """
        self.loop = asyncio.get_running_loop()
        self.connect(host, port, client_id)
        # Run the message loop in a separate thread.
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        await asyncio.sleep(0.5)
        self.startApi()
        # Give the socket a moment to settle.
        await asyncio.sleep(0.5)
        # Optionally verify that the socket is still connected.
        if not self.isConnected():
            raise ConnectionError("Failed to connect to IB gateway")

    async def disconnect_async(self):
        self.disconnect()
        # Give the client a moment to finish cleanly.
        await asyncio.sleep(0.1)
    # ---------------------------------------------------------------------
    # Option chain callbacks
    # ---------------------------------------------------------------------
    def contractDetails(self, reqId: int, contractDetails):
        """Collect each option contract detail.
        The IB API sends a `contractDetails` callback for each matching contract.
        We store the raw `contractDetails` object (it contains a `contract` attribute
        with all the fields we need) in `self.option_chain`.
        """
        print(f"[IB CLIENT] contractDetails received reqId={reqId}, strike={contractDetails.contract.strike}")
        self.option_chain.append(contractDetails)

    def contractDetailsEnd(self, reqId: int):
        # Signal that all option contracts have been received.
        print(f"[IB CLIENT] contractDetailsEnd received reqId={reqId}, total={len(self.option_chain)}")
        if self.loop:
            self.loop.call_soon_threadsafe(self.option_chain_event.set)
        else:
            self.option_chain_event.set()

    # ---------------------------------------------------------------------
    # Market data callbacks
    # ---------------------------------------------------------------------
    def tickPrice(self, reqId: int, tickType: int, price: float, attrib: TickAttrib):
        # tickType 4 is Last, 9 is Close, 68 is Delayed Last, 75 is Delayed Close
        # 1 is Bid, 2 is Ask, 66 is Delayed Bid, 67 is Delayed Ask
        if price > 0:
            if tickType in [1, 2, 4, 9, 66, 67, 68, 75]:
                self.last_spot_price = price
                if self.loop:
                    self.loop.call_soon_threadsafe(self.spot_event.set)
                else:
                    self.spot_event.set()

    # ---------------------------------------------------------------------
    # Option parameter callbacks
    # ---------------------------------------------------------------------
    def securityDefinitionOptionParameter(self, reqId: int, exchange: str, underlyingConId: int, tradingClass: str, multiplier: str, expirations: set, strikes: set):
        print(f"[IB CLIENT] securityDefinitionOptionParameter received reqId={reqId}, exchange={exchange}, tradingClass={tradingClass}")
        if exchange == "SMART":
            self.opt_params.append({
                "tradingClass": tradingClass,
                "multiplier": multiplier,
                "expirations": sorted(list(expirations)),
                "strikes": sorted(list(strikes))
            })

    def securityDefinitionOptionParameterEnd(self, reqId: int):
        print(f"[IB CLIENT] securityDefinitionOptionParameterEnd received reqId={reqId}")
        if self.loop:
            self.loop.call_soon_threadsafe(self.opt_params_event.set)
        else:
            self.opt_params_event.set()

    # ---------------------------------------------------------------------
    # Convenience async helper to fetch an option chain
    # ---------------------------------------------------------------------
    async def fetch_option_chain(self, symbol: str, exchange: str = "SMART", currency: str = "USD", expiration: str = ""):
        """Request the option chain for *symbol* (optionally filtered by *expiration*).
        Returns a list of dictionaries with the most useful contract fields.
        """
        # Reset any previous data
        self.option_chain = []
        self.option_chain_event.clear()

        # Build option contract details
        contract = Contract()
        contract.symbol = symbol
        contract.secType = "OPT"
        contract.exchange = exchange
        contract.currency = currency
        if expiration:
            contract.lastTradeDateOrContractMonth = expiration

        # reqId can be any integer; use 1
        print(f"[IB CLIENT] reqContractDetails called for {symbol} with expiration={expiration}")
        self.reqContractDetails(1, contract)

        # Wait for the callbacks (polling loop with max 15 seconds timeout)
        max_wait = 15
        start = asyncio.get_event_loop().time()
        while not self.option_chain_event.is_set():
            if asyncio.get_event_loop().time() - start > max_wait:
                raise asyncio.TimeoutError("Option chain fetch timed out after 15 seconds")
            await asyncio.sleep(0.2)

        # Transform IBAPI objects into plain dicts for JSON serialization
        result = []
        for cd in self.option_chain:
            c = cd.contract
            result.append({
                "symbol": c.symbol,
                "lastTradeDateOrContractMonth": c.lastTradeDateOrContractMonth,
                "strike": c.strike,
                "right": c.right,
                "exchange": c.exchange,
                "currency": c.currency,
                "localSymbol": c.localSymbol,
            })
        return result

    # ---------------------------------------------------------------------
    # Convenience async helper to fetch option parameter definitions (expirations & strikes)
    # ---------------------------------------------------------------------
    async def fetch_options_params(self, symbol: str, sec_type: str = "STK", exchange: str = "SMART", currency: str = "USD"):
        """Request the option definition parameters for *symbol*.
        Returns a list of dictionaries with expirations and strikes.
        """
        self.opt_params = []
        self.opt_params_event.clear()

        # Step 1: Request contract details for the stock to get its conId
        contract = Contract()
        contract.symbol = symbol
        contract.secType = sec_type
        contract.exchange = exchange
        contract.currency = currency

        self.option_chain = []
        self.option_chain_event.clear()

        # Request contract details for the underlying stock
        print(f"[IB CLIENT] Requesting contract details for stock {symbol}...")
        self.reqContractDetails(2, contract)

        # Wait for the stock contract details
        max_wait = 10
        start = asyncio.get_event_loop().time()
        while not self.option_chain_event.is_set():
            if asyncio.get_event_loop().time() - start > max_wait:
                raise asyncio.TimeoutError("Stock contract details fetch timed out")
            await asyncio.sleep(0.2)

        if not self.option_chain:
            raise ValueError(f"No contract details found for underlying symbol {symbol}")

        con_id = self.option_chain[0].contract.conId
        print(f"[IB CLIENT] Found underlying conId: {con_id}")

        # Step 2: Request option definitions using conId
        print(f"[IB CLIENT] Requesting option definitions parameters for conId {con_id}...")
        self.reqSecDefOptParams(3, symbol, "", sec_type, con_id)

        # Wait for option definitions
        start = asyncio.get_event_loop().time()
        while not self.opt_params_event.is_set():
            if asyncio.get_event_loop().time() - start > max_wait:
                raise asyncio.TimeoutError("Option definitions fetch timed out")
            await asyncio.sleep(0.2)

        return self.opt_params

    # ---------------------------------------------------------------------
    # Convenience async helper to fetch spot price
    # ---------------------------------------------------------------------
    async def fetch_spot_price(self, symbol: str, sec_type: str = "STK", exchange: str = "SMART", currency: str = "USD") -> float:
        """Fetch the spot price of the underlying asset from IB."""
        self.last_spot_price = 0.0
        self.spot_event.clear()
        
        contract = Contract()
        contract.symbol = symbol
        contract.secType = sec_type
        contract.exchange = exchange
        contract.currency = currency
        
        req_id = 100
        # Call reqMarketDataType(3) to enable delayed market data
        self.reqMarketDataType(3)
        self.reqMktData(req_id, contract, "", False, False, [])
        
        try:
            await asyncio.wait_for(self.spot_event.wait(), timeout=4.0)
        except asyncio.TimeoutError:
            pass
        finally:
            self.cancelMktData(req_id)
            
        return self.last_spot_price

    # ---------------------------------------------------------------------
    # Convenience async helper to fetch all account positions
    # ---------------------------------------------------------------------
    async def fetch_positions(self) -> list:
        """Fetch all positions from Interactive Brokers."""
        self.positions = []
        self.positions_event.clear()
        
        print("[IB CLIENT] Requesting all positions from IB...")
        self.reqPositions()
        
        # Wait for the callbacks (polling loop with max 10 seconds timeout)
        max_wait = 10
        start = asyncio.get_event_loop().time()
        while not self.positions_event.is_set():
            if asyncio.get_event_loop().time() - start > max_wait:
                print("[IB CLIENT] Positions fetch timed out")
                break
            await asyncio.sleep(0.1)
            
        try:
            self.cancelPositions()
        except Exception as e:
            print(f"[IB CLIENT] Error calling cancelPositions: {e}")
            
        return self.positions


# Global client connection caching state
from typing import Optional
_global_ib_client: Optional[IBClient] = None
_global_ib_lock = asyncio.Lock()

async def get_global_ib_client(host: str = None, port: int = None, client_id: int = None) -> IBClient:
    global _global_ib_client
    
    # Ingest parameters with fallback chain:
    # 1. Environment variable if set (e.g. IB_HOST)
    # 2. Argument if provided (e.g. host)
    # 3. Default fallback value ("127.0.0.1", 4002, 1)
    
    env_host = os.getenv("IB_HOST")
    final_host = env_host if env_host is not None else (host if host is not None else "127.0.0.1")
    
    env_port = os.getenv("IB_PORT")
    if env_port is not None:
        try:
            final_port = int(env_port)
        except ValueError:
            final_port = port if port is not None else 4002
    else:
        final_port = port if port is not None else 4002
        
    env_client_id = os.getenv("IB_CLIENT_ID")
    if env_client_id is not None:
        try:
            final_client_id = int(env_client_id)
        except ValueError:
            final_client_id = client_id if client_id is not None else 1
    else:
        final_client_id = client_id if client_id is not None else 1

    async with _global_ib_lock:
        if _global_ib_client is None or not _global_ib_client.isConnected():
            if _global_ib_client is not None:
                try:
                    await _global_ib_client.disconnect_async()
                except Exception:
                    pass
            print(f"[IB CONFIG] Creating new persistent IB connection to {final_host}:{final_port} with client_id={final_client_id}...")
            client = IBClient()
            await client.connect_async(final_host, final_port, final_client_id)
            _global_ib_client = client
            # Allow the connection and data farms to warm up
            await asyncio.sleep(2.0)
            print("[IB CONFIG] Persistent connection established and warmed up.")
        return _global_ib_client


