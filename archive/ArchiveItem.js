import ArchiveFile from "./ArchiveFile";
import Util from "./Util";

require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
const Transports = require('dweb-transports');
const Domain = require('../js/Domain');     // So can resolve names like dweb:/arc
const utils = require('../js/utils');
//TODO-NAMING url could be a name

export default class ArchiveItem {
    /*
    Base class representing an Item and/or a Search query (A Collection is both).
    This is just storage, the UI is in ArchiveBase and subclasses, theoretically this class could be used for a server or gateway app with no UI.

    Fields:
    itemid: Archive.org reference for object
    item:   Metadata decoded from JSON from metadata search.
    items:  Array of data from a search.
    _list:  Will hold a list of files when its a single item, TODO-REFACTOR maybe this holds a array of ArchiveItem when its a search BUT only have partial metadata info

    Once subclass SmartDict
    _urls:  Will be list of places to retrieve this data (not quite a metadata call)
     */


    constructor({itemid = undefined, item = undefined}={}) {
        this.itemid = itemid;
        this.item = item; // Havent fetched yet, subclass constructors may override
    }

    _listLoad() {
        /*
         After set this.item, load the _list with an array for ArchiveFile
         Note that this metadata will be un-cached i.e. without in particular the IPFS link and possibly without contenthash link
        */
        this._list = (this.item && this.item.files )
            ? this.item.files.map((f) => new ArchiveFile({itemid: this.itemid, metadata: f})) // Allow methods on files of item
            : [];   // Default to empty, so usage simpler.
    }

    async fetch() {
        /* Fetch what we can about this item, it might be an item or something we have to search for.
            Fetch item metadata as JSON by talking to Metadata API
            Fetch collection info by an advanced search.
            Goes through gateway.dweb.me so that we can work around a CORS issue (general approach & security questions confirmed with Sam!)

            this.itemid Archive Item identifier
            throws: TypeError or Error if fails esp Unable to resolve name
            resolves to: this
         */
        await this.fetch_metadata();
        await this.fetch_query();
        return this;
    }

    async fetch_metadata() {
        if (this.itemid && !this.item) {
            if (verbose) console.group('getting metadata for ' + this.itemid);
            //this.item = await Util.fetch_json(`https://archive.org/metadata/${this.itemid}`);
            const transports = Transports.connectedNamesParm(); // Pass transports, as metadata (currently) much quicker if not using IPFS
            /* OLD WAY VIA HTTP
                this.item = await Util.fetch_json(`https://gateway.dweb.me/metadata/archiveid/${this.itemid}?${transports}`);
            */
            // Fetch via Domain record
            const name = `dweb:/arc/archive.org/metadata/${this.itemid}`;
            let m = await Transports.p_rawfetch([name], {verbose, timeoutMS: 5000}); // Using Transports as its multiurl and might not be HTTP urls
            m = utils.objectfrom(m);
            console.assert(m.metadata.identifier === this.itemid);
            this.item = m;
            this._listLoad();   // Load _list with ArchiveFile
            if (verbose) console.log("Got metadata for " + this.itemid);
            if (verbose) console.groupEnd();
        }
    }

    async fetch_query() {
        if (this.query) {   // This is for Search, Collection and Home.
            const sort = (this.item && this.item.collection_sort_order) || this.sort
            const url =
                //`https://archive.org/advancedsearch?output=json&q=${this.query}&rows=${this.limit}&sort[]=${sort}`; // Archive (CORS fail)
                `https://gateway.dweb.me/metadata/advancedsearch?output=json&q=${this.query}&rows=${this.limit}&sort[]=${sort}&and[]=${this.and}`;
                //`http://localhost:4244/metadata/advancedsearch?output=json&q=${this.query}&rows=${this.limit}&sort[]=${sort}`; //Testing
            console.log(url);
            const j = await Util.fetch_json(url);
            this.items = j.response.docs;
        }
        return this; // For chaining, but note will need to do an "await fetch"
    }


}
