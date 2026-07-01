# Aircast MAVLink

A comprehensive TypeScript/JavaScript library for working with MAVLink protocols, providing both TypeScript type generation from XML dialect files and robust real-time MAVLink message parsing with built-in frame parsing and buffering.

## Features

### Type Generation
- Generate TypeScript interfaces from MAVLink XML dialects
- Support for all MAVLink data types and enums  
- Type-safe enum definitions with numeric values (not string literals)
- Batch processing of multiple dialects
- CLI interface for easy integration

### MAVLink Parser & Decoder  
- **Complete message parsing** - Built-in frame parsing with `parseBytes()` API
- **Protocol support** - MAVLink v1 and v2 message parsing
- **Robust decoding** - Fixed array handling, proper field ordering, graceful error handling
- **Buffering** - Automatic buffer management for partial messages
- **Browser & Node.js** - Universal compatibility with Web Workers
- **Dialect-specific parsers** - Generated parsers for each dialect (Common, ArduPilot, etc.)

## Installation

```bash
# Install the package
npm install @aircast-4g/mavlink

# Or with yarn
yarn add @aircast-4g/mavlink
```

### CDN Usage (Browser)

```html
<!-- ES modules -->
<script type="module">
import { CommonParser } from 'https://esm.sh/@aircast-4g/mavlink@1.1.6/dist/dialects/common/index.js';
</script>

<!-- Or for specific dialects -->
<script type="module">
import { ArdupilotmegaParser } from 'https://esm.sh/@aircast-4g/mavlink@1.1.6/dist/dialects/ardupilotmega/index.js';
</script>
```

### Local Development

```bash
git clone <repository>
cd aircast-mavlink
npm install
npm run build
```

## Usage

### CLI Usage

#### Generate Single Dialect

```bash
# Using the global CLI
aircast-mavlink generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml -o ./types

# Using local installation
node dist/cli.js generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml -o ./types

# Generate from local file
aircast-mavlink generate -i ./dialect.xml -o ./types

# Specify dialect name and format
aircast-mavlink generate -i common.xml -o ./types -n common -f separate
```

#### Batch Generate Multiple Dialects

```bash
# Generate all available dialects
aircast-mavlink batch -o ./mavlink-types

# Generate specific dialects
aircast-mavlink batch -d "common,minimal,ardupilotmega" -o ./mavlink-types

# Generate with package.json
aircast-mavlink batch -o ./mavlink-types --package
```

#### List Available Dialects

```bash
aircast-mavlink list
```

#### CLI Options

**Generate Command:**
- `-i, --input <path>` - Input XML file path or URL
- `-o, --output <path>` - Output directory (default: "./types")
- `-n, --name <name>` - Dialect name (auto-detected if not provided)
- `-f, --format <format>` - Output format: "single" or "separate" (default: "separate")
- `--no-enums` - Skip enum generation
- `--no-type-guards` - Skip type guard generation

**Batch Command:**
- `-o, --output <path>` - Output directory (default: "./mavlink-types")
- `-d, --dialects <dialects>` - Comma-separated dialect names
- `-f, --format <format>` - Output format: "single" or "separate" (default: "separate")
- `--no-enums` - Skip enum generation
- `--no-type-guards` - Skip type guard generation
- `--package` - Generate package.json and tsconfig.json

### Local Development Examples

```bash
# Build the project
npm run build

# Generate common dialect types
node dist/cli.js generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml -o ./output/common

# Generate minimal dialect types
node dist/cli.js generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/minimal.xml -o ./output/minimal

# Generate all dialects
node dist/cli.js batch -o ./output/all-dialects

# List available dialects
node dist/cli.js list

# Generate from local XML file
node dist/cli.js generate -i ./my-dialect.xml -o ./output/custom
```

## Quick Start

### Basic Message Parsing

```typescript
import { CommonParser } from '@aircast-4g/mavlink/dialects/common';

// Create parser instance
const parser = new CommonParser();

// Parse raw MAVLink bytes
const rawBytes = new Uint8Array([/* MAVLink frame data */]);
const messages = parser.parseBytes(rawBytes);

// Process messages
messages.forEach(message => {
  console.log(`Received ${message.message_name} from ${message.system_id}:${message.component_id}`);
  console.log('Payload:', message.payload);
});
```

### Web Worker Integration

```typescript
// worker.js
import { ArdupilotmegaParser } from '@aircast-4g/mavlink/dialects/ardupilotmega';

const parser = new ArdupilotmegaParser();

self.onmessage = (event) => {
  if (event.data.type === 'PARSE_MAVLINK') {
    const messages = parser.parseBytes(event.data.data);
    self.postMessage({ type: 'MESSAGES', messages });
  }
};
```

### Real-time Stream Processing

```typescript
import { CommonParser } from '@aircast-4g/mavlink/dialects/common';

const parser = new CommonParser();

// WebSocket example
websocket.onmessage = (event) => {
  const data = new Uint8Array(event.data);
  const messages = parser.parseBytes(data);
  
  messages.forEach(msg => {
    switch (msg.message_name) {
      case 'HEARTBEAT':
        updateSystemStatus(msg.payload);
        break;
      case 'GPS_RAW_INT':
        updatePosition(msg.payload);
        break;
    }
  });
};
```

## API Reference

### Dialect Parsers

Each dialect has its own parser class with the same interface:

```typescript
// Available parsers
import { CommonParser } from '@aircast-4g/mavlink/dialects/common';
import { ArdupilotmegaParser } from '@aircast-4g/mavlink/dialects/ardupilotmega';
import { MinimalParser } from '@aircast-4g/mavlink/dialects/minimal';
import { StandardParser } from '@aircast-4g/mavlink/dialects/standard';
import { TestParser } from '@aircast-4g/mavlink/dialects/test';

// Parser interface
class DialectParser {
  // Parse raw bytes into messages (handles buffering internally)
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[];
  
  // Decode a single frame 
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage;
  
  // Get supported message IDs
  getSupportedMessageIds(): number[];
  
  // Check if message ID is supported
  supportsMessage(messageId: number): boolean;
  
  // Get message definition
  getMessageDefinition(id: number): MessageDefinition | undefined;
  
  // Get dialect name
  getDialectName(): string;
  
  // Reset internal buffer
  resetBuffer(): void;
}
```

### ParsedMAVLinkMessage

```typescript
interface ParsedMAVLinkMessage {
  timestamp: number;      // Parse timestamp
  system_id: number;      // MAVLink system ID
  component_id: number;   // MAVLink component ID  
  message_id: number;     // Message type ID
  message_name: string;   // Human-readable message name
  sequence: number;       // MAVLink sequence number
  payload: Record<string, any>; // Decoded message fields
  protocol_version: 1 | 2;      // MAVLink protocol version
  checksum: number;       // Frame checksum
  crc_ok: boolean;        // CRC validation result
  signature?: Uint8Array; // MAVLink v2 signature (if present)
  dialect?: string;       // Dialect name
}
```

### Key Benefits of parseBytes()

1. **Automatic Buffering** - Handles partial frames across multiple calls
2. **Frame Synchronization** - Finds valid MAVLink frames in noisy data  
3. **Protocol Detection** - Automatically detects MAVLink v1 vs v2
4. **Robust Parsing** - Gracefully handles malformed data
5. **Zero Configuration** - No setup required, just call parseBytes()

```typescript
const parser = new CommonParser();

// Handle partial data - parser buffers automatically
const part1 = new Uint8Array([0xFE, 0x09, 0x00]); // Partial frame
const part2 = new Uint8Array([0x01, 0x01, 0x00, /* rest of frame */]);

const messages1 = parser.parseBytes(part1); // [] - no complete messages
const messages2 = parser.parseBytes(part2); // [message] - complete message
```

### Programmatic Usage

#### Type Generation

```typescript
import { MAVLinkGenerator, generateTypesFromXML } from '@aircast-4g/mavlink';

// Generate from XML string
const files = await generateTypesFromXML(xmlContent, {
  dialectName: 'common',
  outputFormat: 'separate', // or 'single'
  includeEnums: true,
  includeTypeGuards: true
});

// files is an object with filename -> content mappings
console.log(files['types.ts']);
console.log(files['messages.ts']);
console.log(files['index.ts']);

// Generate from URL or file
const generator = new MAVLinkGenerator();

// From URL
await generator.generateFromURL(
  'https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml',
  './output',
  {
    dialectName: 'common',
    outputFormat: 'separate',
    includeEnums: true,
    includeTypeGuards: true
  }
);
```

## Examples & Integration Patterns

### Real-time Telemetry Processing

```typescript
import { CommonParser } from '@aircast-4g/mavlink/dialects/common';

const parser = new CommonParser();

// WebRTC data channel
dataChannel.onmessage = (event) => {
  const messages = parser.parseBytes(new Uint8Array(event.data));
  messages.forEach(processMessage);
};

// WebSocket connection
websocket.onmessage = (event) => {
  const messages = parser.parseBytes(new Uint8Array(event.data));
  messages.forEach(processMessage);
};

// TCP/UDP streams (Node.js)
socket.on('data', (data) => {
  const messages = parser.parseBytes(data);
  messages.forEach(processMessage);
});
```

### Message Filtering and Routing

```typescript
function processMessage(msg: ParsedMAVLinkMessage) {
  switch (msg.message_name) {
    case 'HEARTBEAT':
      updateSystemStatus(msg.system_id, msg.payload);
      break;
    case 'GPS_RAW_INT':
      updatePosition(msg.payload.lat / 1e7, msg.payload.lon / 1e7);
      break;
    case 'ATTITUDE':
      updateAttitude(msg.payload.roll, msg.payload.pitch, msg.payload.yaw);
      break;
    case 'VFR_HUD':
      updateHUD(msg.payload);
      break;
    case 'STATUSTEXT':
      displayStatusMessage(msg.payload.text, msg.payload.severity);
      break;
  }
}
```

### Error Handling and Recovery

```typescript
try {
  const messages = parser.parseBytes(incomingData);
  messages.forEach(processMessage);
} catch (error) {
  console.error('Parse error:', error.message);
  
  // Reset parser buffer if needed
  parser.resetBuffer();
  
  // Implement reconnection logic
  scheduleReconnect();
}
```

## Robustness & Features

### Parser Robustness
- **Fixed array decoding** - Proper handling of `uint8_t[8]` arrays without double nesting
- **Graceful degradation** - Missing fields get sensible default values 
- **Protocol version detection** - Automatic MAVLink v1/v2 detection
- **Frame synchronization** - Finds valid frames in noisy data streams
- **Buffer management** - Handles partial frames across data chunks
- **Memory efficient** - Reuses buffers, minimal allocations

### Decoder Features  
- **All MAVLink types** - Support for `uint8_t`, `int32_t`, `float`, `double`, `char[N]`, arrays
- **Little-endian parsing** - Correct byte order handling
- **Unknown message handling** - Gracefully processes unsupported message types
- **Field validation** - Bounds checking and safe defaults
- **CRC validation** - Optional checksum verification (simplified implementation)

### Testing & Quality
- **Comprehensive tests** - 20+ test cases covering edge cases
- **Generated decoder tests** - Validates HEARTBEAT, PROTOCOL_VERSION, arrays, partial payloads
- **Frame parsing tests** - Tests v1/v2 protocols, multi-message buffers, invalid data
- **CI/CD integration** - Automated testing on builds

## Pre-generated Types

The package includes pre-generated TypeScript types for common MAVLink dialects:

### Available Dialects
- **CommonTypes** - Standard MAVLink common dialect (most widely used)
- **MinimalTypes** - Minimal MAVLink dialect for basic functionality  
- **ArduPilotMegaTypes** - ArduPilot-specific extensions
- **StandardTypes** - Full standard MAVLink dialect

### Usage Examples

```typescript
import * as CommonTypes from 'aircast-mavlink/types/common';
import * as ArduPilotMegaTypes from 'aircast-mavlink/types/ardupilotmega';

// Type-safe message handling
function handleHeartbeat(msg: CommonTypes.MessageHeartbeat) {
  if (msg.autopilot === CommonTypes.MAV_AUTOPILOTEnum.MAV_AUTOPILOT_ARDUPILOTMEGA) {
    console.log('ArduPilot detected');
  }
}

// Type guards
function isHeartbeat(msg: any): msg is CommonTypes.MessageHeartbeat {
  return CommonTypes.isHeartbeat(msg);
}

// Enum usage
const systemType: CommonTypes.MAV_TYPE = CommonTypes.MAV_TYPEEnum.MAV_TYPE_QUADROTOR;
const flightMode: ArduPilotMegaTypes.COPTER_MODE = ArduPilotMegaTypes.COPTER_MODEEnum.COPTER_MODE_STABILIZE;
```

### Type Structure

Each dialect export includes:
- **Message interfaces** - Typed message payload structures
- **Enum types** - Union types with numeric values  
- **Enum objects** - Runtime enum values
- **Type guards** - Runtime type checking functions
- **Type maps** - Message name to type mappings

```typescript
// Example from CommonTypes
interface MessageHeartbeat {
  type: MAV_TYPE;
  autopilot: MAV_AUTOPILOT;
  base_mode: MAV_MODE_FLAG;
  system_status: MAV_STATE;
  mavlink_version: number;
}

type MAV_TYPE = 0 | 1 | 2 | 3 | number; // Union type

enum MAV_TYPEEnum {  // Runtime enum
  MAV_TYPE_GENERIC = 0,
  MAV_TYPE_FIXED_WING = 1,
  MAV_TYPE_QUADROTOR = 2,
  MAV_TYPE_COAXIAL = 3,
}

function isHeartbeat(msg: any): msg is MessageHeartbeat; // Type guard
```

## Parser API Reference

### MAVLinkParser

Main parser class for processing MAVLink data streams.

```typescript
interface ParserOptions {
  validateCRC?: boolean;     // Enable CRC validation (default: true)
  bufferSize?: number;       // Internal buffer size (default: 4096)
  resetOnError?: boolean;    // Reset parser state on errors (default: true)
}

class MAVLinkParser {
  constructor(options?: ParserOptions);
  
  // Initialize dialect parsers (call before parsing)
  initialize(): Promise<void>;
  
  // Parse bytes and return complete messages
  parseBytes(data: Buffer | Uint8Array): Promise<MAVLinkMessage[]>;
  
  // Parse single message
  parseMessage(data: Uint8Array): Promise<MAVLinkMessage | null>;
  
  // Reset parser state
  reset(): void;
  
  // Get parser statistics
  getStats(): ParserStats;
}
```

### MAVLinkFrameParser

Low-level frame parser with event-based API.

```typescript
class MAVLinkFrameParser extends EventEmitter {
  constructor(options?: ParserOptions);
  
  // Process incoming data
  process(data: Buffer | Uint8Array): void;
  
  // Events:
  // 'frame' - Complete frame received
  // 'error' - Parse error occurred
}
```

### DialectParserFactory

Creates and manages dialect-specific parsers.

```typescript
class DialectParserFactory {
  // Create single dialect parser
  static createParser(dialectName: SupportedDialects): Promise<DialectParser>;
  
  // Create multi-dialect parser
  static createMultipleDialectParser(dialectNames: SupportedDialects[]): Promise<MultiDialectParser>;
  
  // Get list of supported dialects
  static getSupportedDialects(): SupportedDialects[];
}
```

### Message Structure

```typescript
interface MAVLinkMessage {
  sequence: number;
  system_id: number;
  component_id: number;
  message_id: number;
  message_name: string;
  payload: Record<string, any>;
  timestamp: number;
  crc_ok: boolean;
}
```

## Examples

The `examples/` directory contains comprehensive usage examples:

### Browser Examples
- **WebRTC Integration** (`webrtc-integration.html`) - Complete web demo with real-time parsing
- **Web Worker** (`web-worker-example.js`) - Non-blocking parsing in web workers
- **Basic Web Usage** (`test-web.html`) - Simple browser integration

### Node.js Examples  
- **Basic Parser** (`basic-parser.js`) - Fundamental parsing concepts
- **Streaming Data** (`nodejs-stream.js`) - TCP/UDP connections and file replay
- **Production Usage** - Advanced patterns for real applications

### Running Examples

```bash
# Build the project first
npm run build

# Run basic Node.js example
node examples/basic-parser.js

# Run streaming example with different modes
node examples/nodejs-stream.js test              # Run tests
node examples/nodejs-stream.js tcp localhost 5760  # Connect to TCP source
node examples/nodejs-stream.js udp 14550           # Start UDP server
node examples/nodejs-stream.js file data.mavlink   # Replay file

# Serve web examples
python3 -m http.server 8000
# Then open http://localhost:8000/examples/
```

### Common Integration Patterns

#### Real-time Telemetry Processing
```typescript
const parser = new MAVLinkParser({ validateCRC: true });

// WebRTC data channel
dataChannel.onmessage = async (event) => {
  const messages = await parser.parseBytes(new Uint8Array(event.data));
  messages.forEach(processMessage);
};

// WebSocket connection
websocket.onmessage = async (event) => {
  const messages = await parser.parseBytes(new Uint8Array(event.data));
  messages.forEach(processMessage);
};

// TCP/UDP streams (Node.js)
socket.on('data', async (data) => {
  const messages = await parser.parseBytes(data);
  messages.forEach(processMessage);
});
```

#### Message Filtering and Routing
```typescript
function processMessage(msg: MAVLinkMessage) {
  switch (msg.message_name) {
    case 'HEARTBEAT':
      updateSystemStatus(msg.system_id, msg.payload);
      break;
    case 'GPS_RAW_INT':
      updatePosition(msg.payload.lat / 1e7, msg.payload.lon / 1e7);
      break;
    case 'ATTITUDE':
      updateAttitude(msg.payload.roll, msg.payload.pitch, msg.payload.yaw);
      break;
    case 'VFR_HUD':
      updateHUD(msg.payload);
      break;
    case 'STATUSTEXT':
      displayStatusMessage(msg.payload.text, msg.payload.severity);
      break;
  }
}
```

#### Error Handling and Recovery
```typescript
try {
  const messages = await parser.parseBytes(incomingData);
  messages.forEach(processMessage);
} catch (error) {
  console.error('Parse error:', error.message);
  
  // Reset parser state if needed
  if (error.code === 'INVALID_CHECKSUM') {
    parser.reset();
  }
  
  // Implement reconnection logic
  scheduleReconnect();
}
```

## Generated Types

The tool generates TypeScript files with the following structure:

### File Structure

When using `separate` format, the generator creates:
- `types.ts` - Base interfaces and type definitions
- `enums.ts` - Enum object definitions
- `messages.ts` - Message interfaces, type maps, and type guards
- `index.ts` - Main export file

### Example Output

**types.ts**
```typescript
export interface MAVLinkMessage<Content = unknown> {
  timestamp: number;
  system_id: number;
  component_id: number;
  type: string;
  content: Content;
}

export type MAV_STATE =
  | 0 // MAV_STATE_UNINIT - Uninitialized system
  | 1 // MAV_STATE_BOOT - System is booting up
  | 2 // MAV_STATE_STANDBY - System is standby
  | 3 // MAV_STATE_ACTIVE - System is active
  | number;

export type MAV_TYPE =
  | 0 // MAV_TYPE_GENERIC - Generic micro air vehicle
  | 1 // MAV_TYPE_FIXED_WING - Fixed wing aircraft
  | 2 // MAV_TYPE_QUADROTOR - Quadrotor
  | number;
```

**enums.ts**
```typescript
export enum MAV_STATEEnum {
  MAV_STATE_UNINIT = 0,
  MAV_STATE_BOOT = 1,
  MAV_STATE_STANDBY = 2,
  MAV_STATE_ACTIVE = 3,
}
```

**messages.ts**
```typescript
export interface MessageHeartbeat {
  type: MAV_TYPE;
  autopilot: MAV_AUTOPILOT;
  base_mode: MAV_MODE_FLAG;
  system_status: MAV_STATE;
  mavlink_version: number;
}

export interface MessageTypeMap {
  HEARTBEAT: MessageHeartbeat;
  // ... other messages
}

export type AnyMessage = 
  | MAVLinkMessage<MessageHeartbeat>
  | MAVLinkMessage<MessageSysStatus>;

// Type guard functions
export function isHeartbeat(msg: MAVLinkMessage): msg is MAVLinkMessage<MessageHeartbeat> {
  return msg.type === 'HEARTBEAT';
}
```

## Output Formats

### Separate Files (Default)
- `types.ts` - Type definitions and interfaces
- `enums.ts` - Enum object definitions  
- `messages.ts` - Message interfaces and utilities
- `index.ts` - Main export file

### Single File
All definitions combined into a single `index.ts` file.

## Development

```bash
# Setup
npm install
npm run build

# Development workflow
npm run dev        # Run in development mode with tsx
npm run build      # Build TypeScript to JavaScript
npm run test       # Run Jest tests
npm run lint       # Run ESLint
npm run clean      # Clean build artifacts

# Test the CLI locally
node dist/cli.js --help

# Generate test types
node dist/cli.js generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/minimal.xml -o ./test-output
```

## Project Structure

```
├── src/
│   ├── cli.ts                     # Command line interface
│   ├── index.ts                   # Main export file
│   ├── types.ts                   # Shared type definitions
│   ├── generator/                 # Type generation components
│   │   ├── generator.ts           # Main generator class
│   │   ├── template-engine.ts     # Handlebars template engine with decoder
│   │   ├── type-converter.ts      # XML to TypeScript conversion
│   │   ├── xml-parser.ts          # MAVLink XML parser
│   │   └── batch-processor.ts     # Batch processing utilities
│   └── generated/                 # Generated dialect parsers
│       └── dialects/              # Generated parsers for each dialect
│           ├── common/            # Common dialect parser + types
│           ├── ardupilotmega/     # ArduPilot dialect parser + types
│           ├── minimal/           # Minimal dialect parser + types
│           ├── standard/          # Standard dialect parser + types
│           └── test/              # Test dialect parser + types
├── tests/                         # Jest test files
│   ├── decoder.test.ts            # Decoder functionality tests
│   ├── template-engine.test.ts    # Template generation tests
│   ├── xml-parser.test.ts         # XML parsing tests
│   └── generator.test.ts          # End-to-end generation tests
├── dist/                          # Compiled JavaScript output
│   └── dialects/                  # Built dialect parsers for distribution
└── examples/                      # Usage examples and demos
```

### Generated Files Per Dialect

Each dialect directory contains:
- `decoder.ts` - Parser class with parseBytes() and decode() methods
- `types.ts` - Base types and ParsedMAVLinkMessage interface  
- `enums.ts` - Enum definitions and type aliases
- `messages.ts` - Message interfaces and type guards
- `index.ts` - Main export file

## License

MIT