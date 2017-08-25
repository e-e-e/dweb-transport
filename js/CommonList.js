const SmartDict = require("./SmartDict"); //for extends
const Dweb = require("./Dweb");

class CommonList extends SmartDict {
    /*
    CommonList is a superclass for anything that manages a storable list of other urls
    e.g. MutableBlock, KeyChain, AccessControlList

    Fields:
    keypair         Holds a KeyPair used to sign items
    _list           Holds an array of signatures of items put on the list
    _master         True if this is a master list, i.e. can add things
    _publicurl     Holds the url of publicly available version of the list.
    _allowunsafestore True if should override protection against storing unencrypted private keys (usually only during testing)
    dontstoremaster True if should not store master key
    */

    constructor(data, master, key, verbose, options) {
        /*
            Create a new instance of CommonList

            :param url: url of list to fetch from Dweb
            :param data: json string or dict to load fields from
            :param master: boolean, true if should create a master list with private key etc
            :param key: A KeyPair, or a dict of options for creating a key: valid = mnemonic, seed, keygen:true
                keygen: boolean, true means it should generate a key
                mnemonic: BIP39 string to use as a mnemonic to generate the key - TODO not implemented (in JS) yet
                seed: Seed to key generation algorithm
            :param options: dict that overrides any fields of data
         */
        super(data, verbose, options);
        //TODO-REL4 move next chunk to _setdata
        this._list = [];   // Array of members of the list
        if (key) {
            this._setkeypair(key, verbose);
        }
        this._master = (typeof master === "undefined")  ? this.keypair.has_private() : master;  // Note this must be AFTER _setkeypair since that sets based on keypair found and _p_storepublic for example wants to force !master
        if (!this._master && !this._publicurl) {
            this._publicurl = this._url;  // We aren't master, so publicurl is same as url - note URL will only have been set if constructor called from SmartDict.p_fetch
        }
        this.table = "cl";
    }

    keytype() {
        /*
        Return the type of key to use from Dweb.KeyPair.KEYTYPE* constants
        By default its KEYTYPESIGN, but KeyChain subclasses

        :return: constant
         */
        return Dweb.KeyPair.KEYTYPESIGN;
    }

    __setattr__(name, value) {
        /*
        Set a field of the object, this provides the equivalent of Python setters and getters.
        Call chain is ...  or constructor > _setdata > _setproperties > __setattr__
        Subclasses SmartDict

        Default passes "keypair" to _setkeypair
        :param name: string - name of attribute to set
        :param value: anything but usually string from retrieving - what to set name to.
         */
        let verbose = false;
        if (name === "keypair") {
            this._setkeypair(value, verbose);
        } else {
            super.__setattr__(name, value);
        }
    }

    _setkeypair(value, verbose) {
        /*
        Set the keypair attribute, converts value into KeyPair if not already
        Call chain is ...  or constructor > _setdata > _setproperties > __setattr__ > _setkeypair
        Sets _master if value has a private key (note that is overridden in the constructor)

        :param value: KeyPair, or Dict like _key field of KeyPair
         */
        if (value && ! (value instanceof Dweb.KeyPair)) {
            value = new Dweb.KeyPair({ key: value }, verbose) // Note ignoring keytype for now
        }
        this.keypair = value;
        this._master = value && value.has_private();
    }

    preflight(dd) {
        /*
        Prepare a dictionary of data for storage,
        Subclasses SmartDict to:
            convert the keypair for export and check not unintentionally exporting a unencrypted public key
            ensure that _publicurl is stored (by default it would be removed)
        and subclassed by AccessControlList

        :param dd: dict of attributes of this, possibly changed by superclass
        :return: dict of attributes ready for storage.
         */
        if (dd.keypair) {
            if (dd._master && !dd._acl && !this._allowunsafestore) {
                Dweb.utils.SecurityWarning("Probably shouldnt be storing private key", dd);
            }
            dd.keypair = dd._master ? dd.keypair.privateexport() : dd.keypair.publicexport();
        }
        let publicurl = dd._publicurl; // Save before preflight
        let master = dd._master;
        dd = super.preflight(dd);  // Edits dd in place
        if (master) { // Only store on Master, on !Master will be None and override storing url as _publicurl
            dd._publicurl = publicurl;   // May be None, have to do this AFTER the super call as super filters out "_*"
        }
        return dd;
    }

    p_fetchlist(verbose) {
        /*
        Load the list from the Dweb,
        Use p_list_then_elements instead if wish to load the individual items in the list
        */
        let self = this;
        if (!this._publicurl) this._p_storepublic(verbose); // Async, but sets _publicurl immediately
        return Dweb.transport.p_rawlist(this._publicurl, verbose)  //TODO modify to allow listmonitor
            .then((lines) => { // lines should be an array
                if (verbose) console.log("CommonList:p_fetchlist.success", self._url, "len=", lines.length);
                self._list = lines.map((l) => new Dweb.Signature(l, verbose));    // Turn each line into a Signature
            })
    }

    p_list_then_elements(verbose) {
        /*
         Utility function to simplify nested functions, fetches body, list and each element in the list.

         :resolves: list of objects signed and added to the list
        */
        let self=this;
        return this.p_fetchlist(verbose)
            .then(() => Promise.all(Dweb.Signature.filterduplicates(self._list) // Dont load multiple copies of items on list (might need to be an option?)
                .map((sig) => sig.p_fetchdata(verbose)))) // Return is array result of p_fetch which is array of new objs (suitable for storing in keys etc)
        }

    _p_storepublic(verbose) {
        /*
         Store a public version of the object, just stores name field and public key
         Typically subclassed to save specific fields
         Note that this returns immediately after setting url, so caller may not need to wait for success
         */
        //CL(url, data, master, key, verbose, options)
        let cl = new CommonList(null, false, this.keypair, verbose, {"name": this.name});
        cl.p_store(verbose);    // Returns immediately but sets _url first
        this._publicurl = cl._url;
    }

    p_store(verbose) {
        /*
            Store on Dweb, if _master will ensure that stores a public version as well, and saves in _publicurl
            Will store master unless dontstoremaster is set.
         */
        if (this._master && ! this._publicurl) {
            this._p_storepublic(verbose); //Stores asynchronously, but _publicurl set immediately
        }
        if ( ! (this._master && this.dontstoremaster)) {
            return super.p_store(verbose);    // Transportable.store(verbose)
        } else {
            return new Promise((resolve, reject)=> resolve(null));  // I think this should be a noop - fetched already
        }
    }

    publicurl() { console.assert(false, "XXX Undefined function CommonList.publicurl"); }   // For access via web
    privateurl() { console.assert(false, "XXX Undefined function CommonList.privateurl"); }   // For access via web

    p_push(obj, verbose ) {
        /*
         Equivalent to Array.push but returns a promise because asynchronous
         Sign and store a object on a list, stores both locally on _list and sends to Dweb

         :param obj: Should be subclass of SmartDict, (Block is not supported), can be URL of such an obj
         :resolves: sig created in process - for adding to lists etc.
         :throws:   ForbiddenError if not master;
         */
        if (!obj) throw new Dweb.errors.CodingError("CL.p_push obj should never be non-empty");
        let self = this;
        let sig;
        return this.p_store() // Make sure stored
            .then(() => {if (typeof obj !== 'string') obj.p_store()} )
            .then(() => {
                if (!(self._master && self.keypair)) throw new Dweb.errors.ForbiddenError("Signing a new entry when not a master list");
                let url = (typeof obj === 'string') ? obj : obj._url
                sig = this._makesig(url, verbose);
                self._list.push(sig);   // Keep copy locally on _list
            })
            .then(() => self.p_add(sig, verbose))    // Add to list in dweb
            .then(() => sig);
    }

    _makesig(url, verbose) {
        /*
        Utility function to create a signature - used by p_push and in KeyChain.p_push
        :param url:    URL of object to sign
        :returns:       Signature
         */
        if (!url) throw new Dweb.errors.CodingError("Empty url is a coding error");
        if (!this._master) throw new Dweb.errors.ForbiddenError("Must be master to sign something");
        let sig = Dweb.Signature.sign(this, url, verbose); //returns a new Signature
        console.assert(sig.signature, "Must be a signature");
        return sig
    }
    p_add(sig, verbose) {
        /*
        Add a signature to the Dweb for this list

        :param sig: Signature
        :resolves:  undefined
         */
        if (!sig) throw new Dweb.errors.CodingError("CommonList.p_add is meaningless without a sig");
        return Dweb.transport.p_rawadd(sig.url, sig.date, sig.signature, sig.signedby, verbose);
    }

    listmonitor(callback, verbose) {
        Dweb.transport.listmonitor(this._publicurl, (obj) => {
            if (verbose) console.log("CL.listmonitor",this._publicurl,"Added",obj);
            let sig = new Dweb.Signature(obj, verbose);
            this._list.push(sig);
            callback(sig);
        })
    }
    //TODO add many of the methods of Array to CommonList see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
}
exports = module.exports = CommonList;
