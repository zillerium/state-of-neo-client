import { Component, OnInit } from '@angular/core';
import { SignalRService } from "src/core/services/signal-r.service";
import { NodesSignalRService } from "src/core/services/nodes-signal-r.service";
import { BlocksSignalRService } from "src/core/services/blocks-signal-r.service";
import { Http, RequestOptions, Headers } from "@angular/http";
import { NodeRpcService } from 'src/core/services/node-rpc.service';
import { DYNAMIC_TYPE } from '@angular/compiler/src/output/output_ast';
import { TransCountSignalRService } from "src/core/services/trans-count-signal-r.service";
import { TransAvgCountSignalRService } from "src/core/services/trans-avg-count-signal-r.service";

declare var $;
declare var jvm;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  txAvCount: number;
  txCount: number;
  allNodes: any[] = [];
  canRefreshNodeList: boolean;
  allMessages: any[];
  canSendMessage: boolean;
  latestBlock: number;
  secondsSinceLastBlock: number = 0;
  savedNodes: any[] = [];
  baseUrl: string = 'http://localhost:5000';

  constructor(
    private _blockService: BlocksSignalRService,
    private _nodeService: NodesSignalRService,
    private _transCountService: TransCountSignalRService,
    private _transAvgCountService: TransAvgCountSignalRService,
    private _http: Http,
    private nodeRpcService: NodeRpcService
  ) {
    this._blockService.init(`${this.baseUrl}/hubs/block`);
    this._nodeService.init(`${this.baseUrl}/hubs/node`);
    this._transCountService.init(`http://localhost:5000/hubs/trans-count`);
    this._transAvgCountService.init(`http://localhost:5000/hubs/trans-average-count`);
    this.subscribeToEvents();
    this.allMessages = [];

    setInterval(() => this.secondsSinceLastBlock++, 1000);
    setInterval(() => this.sort(), 5000);
    setInterval(() => this.updateNodesData(), 5000);
  }

  get savedRpc() {
    return this.savedNodes.filter(x => x.type == 'RPC');
  }

  get rpcEnabled() {
    return this.savedNodes.filter(x => x.type == 'RPC' && x.rpcEnabled);
  }

  ngOnInit() {
    this._http.get('..\\assets\\json\\mainnet.nodes.json')
      .subscribe(x => {
        this.savedNodes = x.json().sites;
        this.savedNodes.forEach(x => x.upTime = 99);
        let marks = [];
        this.savedNodes.forEach(x => marks.push({
          name: this.getNodeDisplayText(x), 
          latLng: [this.getRandomCoordinate(), this.getRandomCoordinate()]
        }));
      });

    this._http.get(`${this.baseUrl}/api/block/getheight`)
      .subscribe(x => this.updateBestBlock(parseInt(x.json())));

    // window height - header - body padding top and bottom
    let height = $(window).height() - 50 - 20 - 20;
    $('#nodes-panel').css('height', height + 'px');
    $('#main-panel').css('height', height + 'px');

  }

  updateNodesData() {
    this.getVersion(this.allNodes);
    this.getConnectionsCount(this.allNodes);
    this.getRawMemPool(this.allNodes);
    this.getBlockCount(this.allNodes);
  }

  updateBlocks() {
    if (this.canSendMessage) {
      this._http.post(`${this.baseUrl}/api/block`, null, this.getJsonHeaders())
        .subscribe();
    }
  }

  updateNodes() {
    if (this.canRefreshNodeList) {
      this._http.post(`${this.baseUrl}/api/node`, null, this.getJsonHeaders())
        .subscribe();
    }
  }

  nodeIsBehind(node: any) {
    return node.blockCount < this.latestBlock;
  }

  protected getJsonHeaders(): RequestOptions {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    return new RequestOptions({ headers: headers });
  }

  private updateBestBlock(height: number): void {
    this.secondsSinceLastBlock = 0;
    this.latestBlock = height;
    $('#last-block-icon').addClass('fa-spin');
    $('#last-block-icon').css('animation-play-state', 'running');
    setTimeout(() => $('#last-block-icon').css('animation-play-state', 'paused'), 2080);
  }

  private subscribeToEvents(): void {
    this._transCountService.messageReceived.subscribe((count: number) => {
      this.txCount = count;
    });

    this._transAvgCountService.messageReceived.subscribe((avCount: number) => {
      this.txAvCount = avCount;
    });

    this._blockService.connectionEstablished.subscribe(() => {
      this.canSendMessage = true;
    });

    this._blockService.messageReceived.subscribe((message: number) => {
      this.updateBestBlock(message);
    });

    this._nodeService.connectionEstablished.subscribe(() => {
      this.canRefreshNodeList = true;
      this.updateNodes();
    });

    this._nodeService.messageReceived.subscribe((nodes: any[]) => {
      console.log(nodes);
      nodes.forEach(x => {
        if (this.allNodes.find(z => this.getNodeDisplayText(z) == this.getNodeDisplayText(x))) {
          return;
        }

        this.allNodes.push(x);
      })

      let markers = [];
      this.allNodes.forEach(x => {
        markers.push({
          latLng: [x.latitude, x.longitude], name: this.getNodeDisplayText(x)
        });
      });

      this.sort();
      this.updateNodesData();
      this.initMap(markers);      
    });
  }

  private initMap(markers) {
    $('#world-map').html('');
    $('#world-map').css('height', '412px');
    $('#world-map').vectorMap({
      map: 'world_mill_en',
      backgroundColor: 'transparent',
      markers: markers,

      hoverOpacity: 0.7,
      hoverColor: false,
      markersSelectable: true,
      onMarkerSelected: (e: any, code: string, isSelected: boolean, selectedMarkers: any[]) => {
        $('div.jvectormap-container').trigger('markerLabelShow', [map.label, code]);
      },
      onMarkerClick: (e: any, code: string) => {

      },
      onRegionLabelShow: (e: any) => {
        e.preventDefault();
      },
      onMarkerLabelShow: (e: any, label: any, code: string) => {
        // label.html('<h1>TEST TEST TEST</h1>');

      },
      onMarkerTipShow: (e: any, tip: any, code: string) => {

      }
    });

    let map = $('#world-map').vectorMap('get', 'mapObject');

    $(window).resize(function () {
      $('#world-map').css('height', '412px');
    });
  }

  hoverOffNode(node: any) {
    let map = $('#world-map').vectorMap('get', 'mapObject');
    map.clearSelectedMarkers();
    map.label.css('display', 'none');
  }

  hoverNode(node: any) {
    let marker = this.getMarkerByName(this.getNodeDisplayText(node));
    marker.element.isHovered = true;

    let coords = {
      x: marker.element.properties.cx,
      y: marker.element.properties.cy
    }

    let index = marker.element.properties['data-index'];

    let map = $('#world-map').vectorMap('get', 'mapObject');
    map.setSelectedMarkers(index);
  }

  getMarkerByName(name: string): any {
    let map = $('#world-map').vectorMap('get', 'mapObject');

    for (var propName in map.markers) {
      if (map.markers[propName].config.name == name) {
        return map.markers[propName];
      }
    }
  }

  getNodeDisplayText(node: any) {
    return node.successUrl ? node.successUrl : node.ip;
  }

  getClassForNodeBlocks(node: any) {
    let difference = this.latestBlock - node.blockCount;
    if (difference <= 1) {
      return '';
    }

    if (difference > 1 && difference < 10000) {
      return 'text-warning';
    }

    return 'text-danger';
  }

  getClassForNodeLatency(node: any) {
    if (node.latency && node.latency < 500) {
      return 'text-success';
    } else if (node.latency >= 500 && node.latency < 2500) {
      return 'text-warning';
    } else {
      return 'text-danger';
    }
  }

  getClassForNodeUptime(node: any) {
    if (node.upTime && node.upTime >= 98) {
      return 'text-success';
    } else if (node.upTime < 98 && node.upTime >= 93) {
      return 'text-warning';
    } else {
      return 'text-danger';
    }
  }

  private sort() {
    this.allNodes = this.allNodes.sort((x, y) => {
      if (!x.rpcEnabled && y.rpcEnabled) {
        return 1;
      } else if (x.rpcEnabled && !y.rpcEnabled) {
        return -1;
      }

      if (x.type != 'RPC' && y.type == 'RPC') {
        return 1;
      } else if (x.type == 'RPC' && y.type != 'RPC') {
        return -1;
      }

      if (!x.blockCount && y.blockCount) {
        return 1;
      } else if (x.blockCount && !y.blockCount) {
        return -1;
      } else if (x.blockCount != y.blockCount) {
        return y.blockCount - x.blockCount;
      }

      if (!x.connected && y.connected) {
        return 1;
      } else if (!y.connected && x.connected) {
        return -1;
      } else if (x.connected != y.connected) {
        return y.connected - x.connected;
      }

      return x.latency - y.latency;
    });
  }

  private getPeers(nodes: any[]) {
    nodes.forEach(x => {
      let url = `${x.protocol}://${x.url ? x.url : x.ip}:${x.port}`;
      let requestStart = Date.now();
      this.nodeRpcService.callRpcMethod(x.successUrl, 'getpeers', 1)
        .subscribe(res => {
          x.lastResponseTime = Date.now();
          x.latency = x.lastResponseTime - requestStart;
          let json = res.json();
          if (json.result) {
            x.peers = parseInt(json.result.connected.length);
            this.sort();
          } else {
            console.log(res);
          }
        });
    });
  }

  private getConnectionsCount(nodes: any[]) {
    nodes.forEach(x => {
      this.nodeRpcService.callRpcMethod(x.successUrl, 'getconnectioncount', 1)
        .subscribe(res => {
          x.lastResponseTime = Date.now();
          //   x.latency = x.lastResponseTime - requestStart;
          let json = res.json();
          if (json.result) {
            x.connected = parseInt(json.result);
            this.sort();
          } else {
            console.log(res);
          }
        });
    });
  }

  private getVersion(nodes: any[]) {
    nodes.forEach(x => {
      let url = `${x.protocol}://${x.url ? x.url : x.ip}:${x.port}`;
      let requestStart = Date.now();
      this.nodeRpcService.callRpcMethod(x.successUrl, 'getversion', 3)
        .subscribe(res => {
          let now = Date.now();
          x.lastResponseTime = now;
          x.latency = now - requestStart;
          let response = res.json();
          x.version = response.result.useragent;
          x.rpcEnabled = true;
          this.sort();
        }, err => {
          x.rpcEnabled = false;
          x.latency = 0;
        });
    });
  }

  private getBlockCount(nodes: any[]) {
    nodes.forEach(x => {
      let url = `${x.protocol}://${x.url ? x.url : x.ip}:${x.port}`;
      let requestStart = Date.now();
      this.nodeRpcService.callRpcMethod(x.successUrl, 'getblockcount', 3)
        .subscribe(res => {
          let now = Date.now();
          x.lastResponseTime = now;
          x.latency = now - requestStart;
          let response = res.json();
          x.blockCount = response.result;
          this.sort();
        }, err => {
          x.rpcEnabled = false;
          x.latency = 0;
        });
    })
  }

  private getRawMemPool(nodes: any[]) {
    nodes.forEach(x => {
      let url = `${x.protocol}://${x.url ? x.url : x.ip}:${x.port}`;
      let requestStart = Date.now();
      this.nodeRpcService.callRpcMethod(x.successUrl, 'getrawmempool', 1)
        .subscribe(res => {
          x.lastResponseTime = Date.now();
          //    x.latency = x.lastResponseTime - requestStart;
          let response = res.json();
          x.pendingTransactions = response.result.length;
          this.sort();
        });
    });
  }

  private getRandomCoordinate() {
    return parseFloat((Math.random() * 90).toFixed(2));
  }
}
